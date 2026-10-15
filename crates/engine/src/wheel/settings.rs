use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PingloomSettings {
    pub version: u32,
    pub enabled_on_start: bool,
    pub trigger: String, // "alt" | "ctrl" | "shift" | "win" | "caps_lock" | "mouse4" | "mouse5"
    pub emote_trigger: Option<String>,
    pub drag_threshold_px: u32,
    pub click_ping: bool,
    pub click_ping_id: String,
    pub game_check: bool,
    pub wheel: Vec<String>, // Exactly 8 ping IDs
    pub ping_size_px: u32,
    pub ping_duration_s: f64,
    pub volume: u32, // 0..=100
    pub muted: bool,
    pub tick_sound: bool,
    pub emote_click: bool,
    pub click_emote_id: String,
    pub emote_wheel: Vec<String>, // Exactly 8 emote IDs
    pub emote_size_px: u32,
    pub emote_sound: bool,
}

impl Default for PingloomSettings {
    fn default() -> Self {
        Self {
            version: 1,
            enabled_on_start: true,
            trigger: "alt".to_string(),
            emote_trigger: Some("ctrl".to_string()),
            drag_threshold_px: 38,
            click_ping: true,
            click_ping_id: "danger".to_string(),
            game_check: false,
            wheel: vec![
                "danger".to_string(),
                "push".to_string(),
                "omw".to_string(),
                "allin".to_string(),
                "assist".to_string(),
                "needvision".to_string(),
                "missing".to_string(),
                "enemyvision".to_string(),
            ],
            ping_size_px: 52,
            ping_duration_s: 3.0,
            volume: 75,
            muted: false,
            tick_sound: true,
            emote_click: false,
            click_emote_id: "gg_heart".to_string(),
            emote_wheel: vec![
                "come_at_me".to_string(),
                "now_see_here".to_string(),
                "does_not_compute".to_string(),
                "sweating_blitzcrank".to_string(),
                "unworthy_cn".to_string(),
                "gg_heart".to_string(),
                "bee_happy".to_string(),
                "bee_mad".to_string(),
            ],
            emote_size_px: 64,
            emote_sound: true,
        }
    }
}

impl PingloomSettings {
    /// Validates settings fields. Returns Ok(()) or Err(error_message).
    pub fn validate(&self) -> Result<(), String> {
        if self.wheel.len() != 8 {
            return Err(format!(
                "Ping wheel must have exactly 8 directional slots, got {}",
                self.wheel.len()
            ));
        }
        if self.emote_wheel.len() != 8 {
            return Err(format!(
                "Emote wheel must have exactly 8 directional slots, got {}",
                self.emote_wheel.len()
            ));
        }
        if self.volume > 100 {
            return Err(format!("Volume must be between 0 and 100, got {}", self.volume));
        }
        if self.drag_threshold_px < 10 || self.drag_threshold_px > 500 {
            return Err(format!(
                "Drag threshold must be between 10px and 500px, got {}px",
                self.drag_threshold_px
            ));
        }
        if self.ping_size_px < 20 || self.ping_size_px > 200 {
            return Err(format!(
                "Ping size must be between 20px and 200px, got {}px",
                self.ping_size_px
            ));
        }
        if self.ping_duration_s < 0.5 || self.ping_duration_s > 10.0 {
            return Err(format!(
                "Ping duration must be between 0.5s and 10.0s, got {:.1}s",
                self.ping_duration_s
            ));
        }
        for (i, slot) in self.wheel.iter().enumerate() {
            if slot.trim().is_empty() {
                return Err(format!("Slot {} in ping wheel cannot be empty", i));
            }
        }
        for (i, slot) in self.emote_wheel.iter().enumerate() {
            if slot.trim().is_empty() {
                return Err(format!("Slot {} in emote wheel cannot be empty", i));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings_valid() {
        let settings = PingloomSettings::default();
        assert!(settings.validate().is_ok());
        assert_eq!(settings.wheel.len(), 8);
        assert_eq!(settings.emote_wheel.len(), 8);
    }

    #[test]
    fn test_invalid_wheel_len_fails() {
        let mut settings = PingloomSettings::default();
        settings.wheel.pop();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_invalid_volume_fails() {
        let mut settings = PingloomSettings::default();
        settings.volume = 150;
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_invalid_drag_threshold_fails() {
        let mut settings = PingloomSettings::default();
        settings.drag_threshold_px = 5;
        assert!(settings.validate().is_err());
    }
}
