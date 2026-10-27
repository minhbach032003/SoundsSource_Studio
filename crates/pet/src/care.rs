use chrono::{Datelike, Local, Timelike};
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
        self.check_achievements(now_ts);
        gained_xp
    }

    pub fn record_meal(&mut self, now_ts: i64) -> u64 {
        let today = Self::current_day_key();
        self.rollover_day_if_needed(&today);

        self.total_meals += 1;
        self.meals_today += 1;
        self.xp += MEAL_XP;

        self.mark_fed(now_ts, &today);
        self.check_achievements(now_ts);
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
        self.check_achievements(now_ts);
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

    pub fn check_achievements(&mut self, now_ts: i64) {
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
        if self.total_tokens >= 50_000_000 {
            self.unlocked_achievements.insert("tokens50M".into());
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
        if self.level() >= 35 {
            self.unlocked_achievements.insert("level35".into());
        }
        if self.streak_days >= 7 {
            self.unlocked_achievements.insert("streak7".into());
        }
        if self.streak_days >= 14 {
            self.unlocked_achievements.insert("streak14".into());
        }
        if self.streak_days >= 30 {
            self.unlocked_achievements.insert("streak30".into());
        }
        if let Some(dt) = chrono::DateTime::from_timestamp(now_ts, 0) {
            let local_hour = dt.with_timezone(&Local).hour();
            if local_hour < 6 {
                self.unlocked_achievements.insert("nightOwl".into());
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PetCareDocument {
    #[serde(default)]
    pub selected_pet_id: Option<String>,
    #[serde(default)]
    pub states: HashMap<String, PetCareState>,
    #[serde(flatten)]
    pub legacy_state: Option<PetCareState>,
}

pub struct PetCareStore {
    path: PathBuf,
    secondary_path: Option<PathBuf>,
}

impl PetCareStore {
    pub const DEFAULT_PET_ID: &'static str = "default";

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

    fn parse_document(data: &str) -> Option<(HashMap<String, PetCareState>, Option<String>)> {
        // 1. Try parsing single global PetCareState (v1 legacy) first or plain dictionary
        if let Ok(single) = serde_json::from_str::<PetCareState>(data) {
            let mut map = HashMap::new();
            map.insert(Self::DEFAULT_PET_ID.to_string(), single);
            return Some((map, None));
        }

        // 2. Try parsing PetCareDocument: { "selected_pet_id": "...", "states": { "pet_a": { ... } } }
        if let Ok(doc) = serde_json::from_str::<PetCareDocument>(data) {
            let mut states = doc.states;
            let selected = doc.selected_pet_id.clone();
            if states.is_empty() {
                if let Some(leg) = doc.legacy_state {
                    let pet_id = selected.as_deref().unwrap_or(Self::DEFAULT_PET_ID);
                    states.insert(pet_id.to_string(), leg);
                }
            }
            if !states.is_empty() {
                return Some((states, selected));
            }
        }

        // 3. Try parsing plain [String: PetCareState] dictionary (Swift agentpet.care.v2 export)
        if let Ok(dict) = serde_json::from_str::<HashMap<String, PetCareState>>(data) {
            if !dict.is_empty() {
                return Some((dict, None));
            }
        }

        None
    }

    pub fn load_all(&self) -> (HashMap<String, PetCareState>, Option<String>) {
        let mut primary_doc: Option<(HashMap<String, PetCareState>, Option<String>)> = None;
        if let Ok(data) = fs::read_to_string(&self.path) {
            primary_doc = Self::parse_document(&data);
        }

        let mut secondary_doc: Option<(HashMap<String, PetCareState>, Option<String>)> = None;
        if let Some(ref sec_path) = self.secondary_path {
            if let Ok(data) = fs::read_to_string(sec_path) {
                secondary_doc = Self::parse_document(&data);
            }
        }

        let (mut states, selected) = match (primary_doc, secondary_doc) {
            (Some((p_states, p_sel)), Some((s_states, s_sel))) => {
                let mut merged = p_states;
                for (pet_id, s_state) in s_states {
                    if let Some(p_state) = merged.remove(&pet_id) {
                        merged.insert(pet_id, Self::merge_states(p_state, s_state));
                    } else {
                        merged.insert(pet_id, s_state);
                    }
                }
                (merged, p_sel.or(s_sel))
            }
            (Some(doc), None) => doc,
            (None, Some(doc)) => doc,
            (None, None) => (HashMap::new(), None),
        };

        let today = PetCareState::current_day_key();
        for state in states.values_mut() {
            state.rollover_day_if_needed(&today);
        }

        (states, selected)
    }

    pub fn load_for_pet(&self, pet_id: Option<&str>) -> PetCareState {
        let (states, selected) = self.load_all();
        let target_id = pet_id
            .or(selected.as_deref())
            .unwrap_or(Self::DEFAULT_PET_ID);

        if let Some(state) = states.get(target_id) {
            return state.clone();
        }

        // If specific non-default pet requested and not found, start fresh
        if let Some(id) = pet_id {
            if id != Self::DEFAULT_PET_ID && selected.as_deref() != Some(id) {
                return PetCareState::default();
            }
        }

        // Fallback: if target_id not found but DEFAULT_PET_ID exists, or first existing pet
        if let Some(def) = states.get(Self::DEFAULT_PET_ID) {
            def.clone()
        } else if let Some((_, first)) = states.iter().next() {
            first.clone()
        } else {
            PetCareState::default()
        }
    }

    pub fn load(&self) -> PetCareState {
        self.load_for_pet(None)
    }

    pub fn save_all(
        &self,
        states: &HashMap<String, PetCareState>,
        selected_pet_id: Option<&str>,
    ) -> Result<(), std::io::Error> {
        let doc = PetCareDocument {
            selected_pet_id: selected_pet_id.map(|s| s.to_string()),
            states: states.clone(),
            legacy_state: None,
        };

        let json = serde_json::to_string_pretty(&doc).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
        })?;

        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&self.path, &json)?;

        if let Some(ref sec_path) = self.secondary_path {
            if let Some(parent) = sec_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(sec_path, &json);
        }

        Ok(())
    }

    pub fn save_for_pet(
        &self,
        pet_id: Option<&str>,
        state: &PetCareState,
    ) -> Result<(), std::io::Error> {
        let (mut states, selected) = self.load_all();
        let target_id = pet_id
            .or(selected.as_deref())
            .unwrap_or(Self::DEFAULT_PET_ID);

        states.insert(target_id.to_string(), state.clone());
        self.save_all(&states, selected.as_deref())
    }

    pub fn save(&self, state: &PetCareState) -> Result<(), std::io::Error> {
        self.save_for_pet(None, state)
    }

    pub fn load_document(&self) -> PetCareDocument {
        let (states, selected_pet_id) = self.load_all();
        PetCareDocument {
            selected_pet_id,
            states,
            legacy_state: None,
        }
    }

    pub fn save_document(&self, doc: &PetCareDocument) -> Result<(), std::io::Error> {
        self.save_all(&doc.states, doc.selected_pet_id.as_deref())
    }

    pub fn merge_documents(d1: PetCareDocument, d2: PetCareDocument) -> PetCareDocument {
        let mut merged_states = d1.states;
        for (pet_id, s2) in d2.states {
            if let Some(s1) = merged_states.remove(&pet_id) {
                merged_states.insert(pet_id, Self::merge_states(s1, s2));
            } else {
                merged_states.insert(pet_id, s2);
            }
        }
        let selected = d1.selected_pet_id.or(d2.selected_pet_id);
        PetCareDocument {
            selected_pet_id: selected,
            states: merged_states,
            legacy_state: None,
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

        let reloaded1 = store.load_for_pet(None);
        assert_eq!(reloaded1.xp, 1166);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_per_pet_isolation_and_migration() {
        let temp_dir = std::env::temp_dir().join(format!("pet_care_per_pet_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let path = temp_dir.join("care.json");

        // 1. Write legacy v1 format: single PetCareState at root
        let mut legacy_state = PetCareState::default();
        legacy_state.xp = 500;
        legacy_state.total_tokens = 25_000;
        std::fs::write(&path, serde_json::to_string_pretty(&legacy_state).unwrap()).unwrap();

        let store = PetCareStore::new(&path);

        // Load falls back to legacy for default or any initial read
        let loaded_def = store.load_for_pet(Some("default"));
        assert_eq!(loaded_def.xp, 500);

        // A new pet "dragon" starts fresh
        let loaded_dragon = store.load_for_pet(Some("dragon"));
        assert_eq!(loaded_dragon.xp, 0);

        // Mutate and save dragon independently
        let mut dragon_state = loaded_dragon;
        dragon_state.xp = 1200;
        store.save_for_pet(Some("dragon"), &dragon_state).unwrap();

        // Check A/B isolation: default pet is still 500 XP, dragon is 1200 XP
        let (all_states, _) = store.load_all();
        assert_eq!(all_states.get("default").unwrap().xp, 500);
        assert_eq!(all_states.get("dragon").unwrap().xp, 1200);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_all_14_achievements_unlock_conditions() {
        let mut state = PetCareState::default();
        let midday_ts = Local::now().date_naive().and_hms_opt(12, 0, 0).unwrap().and_local_timezone(Local).unwrap().timestamp();
        let night_ts = Local::now().date_naive().and_hms_opt(3, 0, 0).unwrap().and_local_timezone(Local).unwrap().timestamp();
        state.record_meal(midday_ts);
        assert!(state.unlocked_achievements.contains("firstMeal"));

        // 2. sessions100
        state.total_meals = 100;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("sessions100"));

        // 3. sessions500
        state.total_meals = 500;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("sessions500"));

        // 4. tokens1M
        state.total_tokens = 1_000_000;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("tokens1M"));

        // 5. tokens10M
        state.total_tokens = 10_000_000;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("tokens10M"));

        // 6. tokens50M
        state.total_tokens = 50_000_000;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("tokens50M"));

        // 7. level5
        state.xp = PetCareState::xp_to_reach(5);
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("level5"));

        // 8. level10
        state.xp = PetCareState::xp_to_reach(10);
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("level10"));

        // 9. level20
        state.xp = PetCareState::xp_to_reach(20);
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("level20"));

        // 10. level35
        state.xp = PetCareState::xp_to_reach(35);
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("level35"));

        // 11. streak7
        state.streak_days = 7;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("streak7"));

        // 12. streak14
        state.streak_days = 14;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("streak14"));

        // 13. streak30
        state.streak_days = 30;
        state.check_achievements(12 * 3600);
        assert!(state.unlocked_achievements.contains("streak30"));

        // 14. nightOwl (between midnight and 6 AM)
        assert!(!state.unlocked_achievements.contains("nightOwl"));
        state.apply_care_action("pet", night_ts);
        assert!(state.unlocked_achievements.contains("nightOwl"));

        assert_eq!(state.unlocked_achievements.len(), 14);
    }

    #[test]
    fn test_merge_documents_monotonic() {
        let mut doc1 = PetCareDocument {
            selected_pet_id: Some("goku".to_string()),
            states: HashMap::new(),
            legacy_state: None,
        };
        let mut s1 = PetCareState::default();
        s1.xp = 120;
        s1.total_tokens = 5000;
        doc1.states.insert("goku".to_string(), s1);

        let mut doc2 = PetCareDocument {
            selected_pet_id: Some("cat".to_string()),
            states: HashMap::new(),
            legacy_state: None,
        };
        let mut s2 = PetCareState::default();
        s2.xp = 360;
        s2.total_tokens = 2000;
        doc2.states.insert("goku".to_string(), s2);
        let mut s3 = PetCareState::default();
        s3.xp = 50;
        doc2.states.insert("cat".to_string(), s3);

        let merged = PetCareStore::merge_documents(doc1, doc2);
        assert_eq!(merged.selected_pet_id, Some("goku".to_string()));
        let goku = merged.states.get("goku").unwrap();
        assert_eq!(goku.xp, 360);
        assert_eq!(goku.total_tokens, 5000);
        let cat = merged.states.get("cat").unwrap();
        assert_eq!(cat.xp, 50);
    }
}
