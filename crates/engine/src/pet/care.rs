use chrono::{Datelike, Local};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const TOKENS_PER_XP: u64 = 5_000;
pub const MEAL_XP: u64 = 25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetHunger {
    Full,
    Satisfied,
    Peckish,
    Hungry,
    Starving,
}

impl PetHunger {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Satisfied => "satisfied",
            Self::Peckish => "peckish",
            Self::Hungry => "hungry",
            Self::Starving => "starving",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PetCareState {
    pub xp: u64,
    pub token_carry: u64,
    pub tokens_today: u64,
    pub meals_today: u32,
    pub total_tokens: u64,
    pub total_meals: u32,
    pub last_fed_at: Option<i64>,
    pub day_key: String,
    pub streak_days: u32,
    pub last_fed_day_key: Option<String>,
    pub days: HashMap<String, u64>,
    pub unlocked_achievements: HashSet<String>,
}

impl Default for PetCareState {
    fn default() -> Self {
        Self {
            xp: 0,
            token_carry: 0,
            tokens_today: 0,
            meals_today: 0,
            total_tokens: 0,
            total_meals: 0,
            last_fed_at: None,
            day_key: Self::current_day_key(),
            streak_days: 0,
            last_fed_day_key: None,
            days: HashMap::new(),
            unlocked_achievements: HashSet::new(),
        }
    }
}

impl PetCareState {
    pub fn current_day_key() -> String {
        let now = Local::now();
        format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
    }

    pub fn level(&self) -> u32 {
        Self::level_for_xp(self.xp)
    }

    pub fn display_level(&self) -> u32 {
        self.level().saturating_sub(1)
    }

    pub fn xp_to_reach(level: u32) -> u64 {
        if level <= 1 {
            0
        } else {
            60 * (level as u64) * ((level - 1) as u64)
        }
    }

    pub fn level_for_xp(xp: u64) -> u32 {
        let mut level = 1;
        while Self::xp_to_reach(level + 1) <= xp {
            level += 1;
        }
        level
    }

    pub fn progress(&self) -> f64 {
        let level = self.level();
        let floor = Self::xp_to_reach(level);
        let ceiling = Self::xp_to_reach(level + 1);
        if ceiling > floor {
            (self.xp.saturating_sub(floor) as f64) / ((ceiling - floor) as f64)
        } else {
            0.0
        }
    }

    pub fn xp_within_level(&self) -> (u64, u64) {
        let level = self.level();
        let floor = Self::xp_to_reach(level);
        let ceiling = Self::xp_to_reach(level + 1);
        (self.xp.saturating_sub(floor), ceiling.saturating_sub(floor).max(1))
    }

    pub fn stage_name(&self) -> &'static str {
        match self.level() {
            0..=4 => "Hatchling",
            5..=9 => "Companion",
            10..=19 => "Scout",
            20..=34 => "Hero",
            _ => "Legend",
        }
    }

    pub fn stage_index(&self) -> usize {
        match self.level() {
            0..=4 => 0,
            5..=9 => 1,
            10..=19 => 2,
            20..=34 => 3,
            _ => 4,
        }
    }

    pub fn hunger(&self, now_timestamp: i64) -> PetHunger {
        let Some(last) = self.last_fed_at else {
            return PetHunger::Peckish;
        };
        let diff_secs = (now_timestamp - last).max(0);
        let hours = (diff_secs as f64) / 3600.0;
        if hours < 4.0 {
            PetHunger::Full
        } else if hours < 10.0 {
            PetHunger::Satisfied
        } else if hours < 24.0 {
            PetHunger::Peckish
        } else if hours < 48.0 {
            PetHunger::Hungry
        } else {
            PetHunger::Starving
        }
    }

    pub fn rollover_day_if_needed(&mut self, today: &str) {
        if self.day_key != today {
            self.day_key = today.to_string();
            self.tokens_today = 0;
            self.meals_today = 0;
        }
    }

    pub fn feed_tokens(&mut self, tokens: u64, now_ts: i64) -> u64 {
        if tokens == 0 {
            return 0;
        }
        let today = Self::current_day_key();
        self.rollover_day_if_needed(&today);

        self.total_tokens += tokens;
        self.tokens_today += tokens;

        *self.days.entry(today.clone()).or_insert(0) += tokens;
        if self.days.len() > 14 {
            let mut keys: Vec<String> = self.days.keys().cloned().collect();
            keys.sort();
            for k in keys.iter().take(keys.len() - 14) {
                self.days.remove(k);
            }
        }

        let pool = self.token_carry + tokens;
        let gained_xp = pool / TOKENS_PER_XP;
        self.token_carry = pool % TOKENS_PER_XP;
        self.xp += gained_xp;

        self.mark_fed(now_ts, &today);
        self.check_achievements();
        gained_xp
    }

    pub fn record_meal(&mut self, now_ts: i64) -> u64 {
        let today = Self::current_day_key();
        self.rollover_day_if_needed(&today);

        self.total_meals += 1;
        self.meals_today += 1;
        self.xp += MEAL_XP;

        self.mark_fed(now_ts, &today);
        self.check_achievements();
        MEAL_XP
    }

    pub fn apply_care_action(&mut self, action: &str, now_ts: i64) -> u64 {
        let gained = match action {
            "pet" => 15,
            "coffee" => 25,
            "tuna" => 20,
            "rest" => 10,
            _ => 10,
        };
        self.xp += gained;
        let today = Self::current_day_key();
        self.mark_fed(now_ts, &today);
        self.check_achievements();
        gained
    }

    fn mark_fed(&mut self, now_ts: i64, today: &str) {
        self.last_fed_at = Some(now_ts);
        if let Some(last_day) = &self.last_fed_day_key {
            if last_day != today {
                // Calculate streak
                self.streak_days = self.streak_days.saturating_add(1);
                self.last_fed_day_key = Some(today.to_string());
            }
        } else {
            self.streak_days = 1;
            self.last_fed_day_key = Some(today.to_string());
        }
    }

    fn check_achievements(&mut self) {
        if self.total_meals >= 1 {
            self.unlocked_achievements.insert("firstMeal".into());
        }
        if self.total_meals >= 100 {
            self.unlocked_achievements.insert("sessions100".into());
        }
        if self.total_meals >= 500 {
            self.unlocked_achievements.insert("sessions500".into());
        }
        if self.total_tokens >= 1_000_000 {
            self.unlocked_achievements.insert("tokens1M".into());
        }
        if self.total_tokens >= 10_000_000 {
            self.unlocked_achievements.insert("tokens10M".into());
        }
        if self.level() >= 5 {
            self.unlocked_achievements.insert("level5".into());
        }
        if self.level() >= 10 {
            self.unlocked_achievements.insert("level10".into());
        }
        if self.level() >= 20 {
            self.unlocked_achievements.insert("level20".into());
        }
        if self.streak_days >= 7 {
            self.unlocked_achievements.insert("streak7".into());
        }
        if self.streak_days >= 30 {
            self.unlocked_achievements.insert("streak30".into());
        }
    }
}

pub struct PetCareStore {
    path: PathBuf,
    secondary_path: Option<PathBuf>,
}

impl PetCareStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            secondary_path: None,
        }
    }

    pub fn with_secondary(path: impl Into<PathBuf>, secondary: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            secondary_path: Some(secondary.into()),
        }
    }

    pub fn default_path() -> PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            let agentpet_path = Path::new(&home).join(".agentpet").join("petcare.json");
            if agentpet_path.exists() {
                agentpet_path
            } else {
                Path::new(&home).join(".rust-sound").join("petcare.json")
            }
        } else {
            PathBuf::from("petcare.json")
        }
    }

    pub fn default_secondary_path() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("HOME") {
            Some(Path::new(&home).join(".rust-sound").join("petcare.json"))
        } else {
            None
        }
    }

    pub fn load(&self) -> PetCareState {
        let mut primary_state: Option<PetCareState> = None;
        if let Ok(data) = fs::read_to_string(&self.path) {
            if let Ok(mut state) = serde_json::from_str::<PetCareState>(&data) {
                let today = PetCareState::current_day_key();
                state.rollover_day_if_needed(&today);
                primary_state = Some(state);
            }
        }

        let mut secondary_state: Option<PetCareState> = None;
        if let Some(ref sec_path) = self.secondary_path {
            if let Ok(data) = fs::read_to_string(sec_path) {
                if let Ok(mut state) = serde_json::from_str::<PetCareState>(&data) {
                    let today = PetCareState::current_day_key();
                    state.rollover_day_if_needed(&today);
                    secondary_state = Some(state);
                }
            }
        }

        match (primary_state, secondary_state) {
            (Some(s1), Some(s2)) => Self::merge_states(s1, s2),
            (Some(s), None) => s,
            (None, Some(s)) => s,
            (None, None) => PetCareState::default(),
        }
    }

    pub fn merge_states(mut s1: PetCareState, s2: PetCareState) -> PetCareState {
        s1.xp = s1.xp.max(s2.xp);
        s1.total_tokens = s1.total_tokens.max(s2.total_tokens);
        s1.total_meals = s1.total_meals.max(s2.total_meals);
        s1.streak_days = s1.streak_days.max(s2.streak_days);
        s1.tokens_today = s1.tokens_today.max(s2.tokens_today);
        s1.meals_today = s1.meals_today.max(s2.meals_today);
        s1.token_carry = s1.token_carry.max(s2.token_carry);

        s1.last_fed_at = match (s1.last_fed_at, s2.last_fed_at) {
            (Some(t1), Some(t2)) => Some(t1.max(t2)),
            (a, b) => a.or(b),
        };

        for (k, v) in s2.days {
            let entry = s1.days.entry(k).or_insert(0);
            *entry = (*entry).max(v);
        }

        for ach in s2.unlocked_achievements {
            s1.unlocked_achievements.insert(ach);
        }

        s1
    }

    pub fn save(&self, state: &PetCareState) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(state).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
        })?;

        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&self.path, &json);

        if let Some(ref sec_path) = self.secondary_path {
            if let Some(parent) = sec_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(sec_path, &json);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xp_and_level_progression() {
        assert_eq!(PetCareState::xp_to_reach(1), 0);
        assert_eq!(PetCareState::xp_to_reach(2), 120);
        assert_eq!(PetCareState::xp_to_reach(3), 360);
        assert_eq!(PetCareState::xp_to_reach(5), 1200);

        assert_eq!(PetCareState::level_for_xp(0), 1);
        assert_eq!(PetCareState::level_for_xp(119), 1);
        assert_eq!(PetCareState::level_for_xp(120), 2);
        assert_eq!(PetCareState::level_for_xp(359), 2);
        assert_eq!(PetCareState::level_for_xp(360), 3);
    }

    #[test]
    fn test_stages_and_display_level() {
        let mut state = PetCareState::default();
        assert_eq!(state.display_level(), 0);
        assert_eq!(state.stage_name(), "Hatchling");

        state.xp = 1200; // Level 5
        assert_eq!(state.level(), 5);
        assert_eq!(state.display_level(), 4);
        assert_eq!(state.stage_name(), "Companion");
    }

    #[test]
    fn test_token_and_meal_feeding() {
        let mut state = PetCareState::default();
        let gained = state.feed_tokens(10_500, 1000);
        assert_eq!(gained, 2);
        assert_eq!(state.xp, 2);
        assert_eq!(state.token_carry, 500);
        assert_eq!(state.total_tokens, 10_500);

        let meal_gained = state.record_meal(1010);
        assert_eq!(meal_gained, 25);
        assert_eq!(state.xp, 27);
        assert_eq!(state.total_meals, 1);
        assert!(state.unlocked_achievements.contains("firstMeal"));
    }

    #[test]
    fn test_hunger_decay() {
        let mut state = PetCareState::default();
        assert_eq!(state.hunger(1000), PetHunger::Peckish);

        state.last_fed_at = Some(1000);
        assert_eq!(state.hunger(1000 + 3600), PetHunger::Full); // 1 hour
        assert_eq!(state.hunger(1000 + 5 * 3600), PetHunger::Satisfied); // 5 hours
        assert_eq!(state.hunger(1000 + 15 * 3600), PetHunger::Peckish); // 15 hours
        assert_eq!(state.hunger(1000 + 30 * 3600), PetHunger::Hungry); // 30 hours
        assert_eq!(state.hunger(1000 + 50 * 3600), PetHunger::Starving); // 50 hours
    }

    #[test]
    fn test_pet_care_dual_store_synchronization() {
        let temp_dir = std::env::temp_dir().join(format!("petcare_sync_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let path1 = temp_dir.join("store1.json");
        let path2 = temp_dir.join("store2.json");

        let mut s1 = PetCareState::default();
        s1.xp = 1141;
        s1.total_tokens = 7500;
        let json1 = serde_json::to_string_pretty(&s1).unwrap();
        std::fs::write(&path1, json1).unwrap();

        let mut s2 = PetCareState::default();
        s2.xp = 740;
        s2.total_meals = 3;
        let json2 = serde_json::to_string_pretty(&s2).unwrap();
        std::fs::write(&path2, json2).unwrap();

        let store = PetCareStore::with_secondary(&path1, &path2);
        let loaded = store.load();

        assert_eq!(loaded.xp, 1141, "Must pick highest XP between stores");
        assert_eq!(loaded.total_tokens, 7500);
        assert_eq!(loaded.total_meals, 3);

        let mut updated = loaded.clone();
        updated.xp += 25;
        store.save(&updated).unwrap();

        let reloaded1: PetCareState = serde_json::from_str(&std::fs::read_to_string(&path1).unwrap()).unwrap();
        let reloaded2: PetCareState = serde_json::from_str(&std::fs::read_to_string(&path2).unwrap()).unwrap();
        assert_eq!(reloaded1.xp, 1166);
        assert_eq!(reloaded2.xp, 1166);

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
