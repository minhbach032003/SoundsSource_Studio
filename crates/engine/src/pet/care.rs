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
}

impl PetCareStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn default_path() -> PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            Path::new(&home).join(".rust-sound").join("petcare.json")
        } else {
            PathBuf::from("petcare.json")
        }
    }

    pub fn load(&self) -> PetCareState {
        if let Ok(data) = fs::read_to_string(&self.path) {
            if let Ok(mut state) = serde_json::from_str::<PetCareState>(&data) {
                let today = PetCareState::current_day_key();
                state.rollover_day_if_needed(&today);
                return state;
            }
        }
        PetCareState::default()
    }

    pub fn save(&self, state: &PetCareState) -> Result<(), std::io::Error> {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(state).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
        })?;
        fs::write(&self.path, json)
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
}
