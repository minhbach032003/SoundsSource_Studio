use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::ops::{BitOr, BitOrAssign};
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::model::{
    EmoteId, PingId, Trigger, DEFAULT_CLICK_EMOTE, DEFAULT_CLICK_PING, DEFAULT_EMOTE_WHEEL,
    DEFAULT_PING_WHEEL, EMOTE_ASSETS,
};

pub const LEGACY_SETTINGS_DIR_NAME: &str = "lolPing";
pub const SETTINGS_FILE_NAME: &str = "settings.json";

/// Resolves the canonical user settings path under Roaming AppData / Application Support.
pub fn resolve_settings_path(roaming_appdata: impl AsRef<Path>) -> std::path::PathBuf {
    roaming_appdata
        .as_ref()
        .join(LEGACY_SETTINGS_DIR_NAME)
        .join(SETTINGS_FILE_NAME)
}

const MAX_SETTINGS_BYTES: u64 = 64 * 1024;
pub const MOD_CTRL: u8 = 1;
pub const MOD_ALT: u8 = 2;
pub const MOD_SHIFT: u8 = 4;
pub const MOD_WIN: u8 = 8;
pub const PRIMARY_MODS: u8 = MOD_CTRL | MOD_ALT | MOD_WIN;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(transparent)]
pub struct ToggleMods(pub u8);

impl ToggleMods {
    pub const CTRL: Self = Self(MOD_CTRL);
    pub const ALT: Self = Self(MOD_ALT);
    pub const SHIFT: Self = Self(MOD_SHIFT);
    pub const WIN: Self = Self(MOD_WIN);
}

impl BitOr for ToggleMods {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        Self(self.0 | rhs.0)
    }
}

impl BitOrAssign for ToggleMods {
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Hotkey {
    pub mods: ToggleMods,
    pub vk: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct Settings {
    pub version: u8,
    pub enabled_on_start: bool,
    pub trigger: Trigger,
    pub emote_trigger: Option<Trigger>,
    pub toggle_hotkey: Hotkey,
    pub drag_threshold_px: u8,
    pub click_ping: bool,
    pub click_ping_id: PingId,
    pub game_check: bool,
    pub wheel: [PingId; 8],
    pub ping_size_px: u16,
    pub ping_duration_s: f32,
    pub volume: u8,
    pub muted: bool,
    pub tick_sound: bool,
    pub emote_click: bool,
    pub click_emote_id: EmoteId,
    pub emote_wheel: [EmoteId; 8],
    pub emote_size_px: u16,
    pub emote_sound: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            enabled_on_start: true,
            trigger: Trigger::Alt,
            emote_trigger: Some(Trigger::Ctrl),
            toggle_hotkey: Hotkey {
                mods: ToggleMods::CTRL | ToggleMods::ALT,
                vk: b'P',
            },
            drag_threshold_px: 8,
            click_ping: false,
            click_ping_id: DEFAULT_CLICK_PING,
            game_check: true,
            wheel: DEFAULT_PING_WHEEL,
            ping_size_px: 110,
            ping_duration_s: 3.2,
            volume: 70,
            muted: false,
            tick_sound: true,
            emote_click: false,
            click_emote_id: DEFAULT_CLICK_EMOTE.to_owned(),
            emote_wheel: DEFAULT_EMOTE_WHEEL.map(str::to_owned),
            emote_size_px: 150,
            emote_sound: true,
        }
    }
}

#[derive(Debug)]
pub enum SettingsError {
    Io(io::Error),
    Json(serde_json::Error),
    Invalid(&'static str),
}

impl std::fmt::Display for SettingsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "settings I/O error: {error}"),
            Self::Json(error) => write!(f, "invalid settings JSON: {error}"),
            Self::Invalid(message) => write!(f, "invalid settings: {message}"),
        }
    }
}

impl std::error::Error for SettingsError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Invalid(_) => None,
        }
    }
}

impl From<io::Error> for SettingsError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl Settings {
    pub fn validate(&self) -> Result<(), SettingsError> {
        if self.version != 1 {
            return Err(SettingsError::Invalid("unsupported version"));
        }
        validate_trigger(self.trigger)?;
        if let Some(trigger) = self.emote_trigger {
            validate_trigger(trigger)?;
            if same_trigger(self.trigger, trigger) {
                return Err(SettingsError::Invalid(
                    "ping and emote triggers must differ",
                ));
            }
        }
        let mods = self.toggle_hotkey.mods.0;
        if mods == 0 || mods & !0x0f != 0 || mods & PRIMARY_MODS == 0 {
            return Err(SettingsError::Invalid(
                "toggle shortcut needs Ctrl, Alt, or Win",
            ));
        }
        if !is_vk(self.toggle_hotkey.vk) || is_modifier_vk(self.toggle_hotkey.vk) {
            return Err(SettingsError::Invalid("invalid toggle shortcut key"));
        }
        if trigger_uses_vk(self.trigger, self.toggle_hotkey.vk)
            || self
                .emote_trigger
                .is_some_and(|trigger| trigger_uses_vk(trigger, self.toggle_hotkey.vk))
        {
            return Err(SettingsError::Invalid(
                "toggle shortcut key conflicts with a trigger",
            ));
        }
        if !(2..=40).contains(&self.drag_threshold_px) {
            return Err(SettingsError::Invalid(
                "drag threshold must be 2..=40 pixels",
            ));
        }
        if !(60..=220).contains(&self.ping_size_px) {
            return Err(SettingsError::Invalid("ping size must be 60..=220 pixels"));
        }
        if !self.ping_duration_s.is_finite() || !(1.0..=8.0).contains(&self.ping_duration_s) {
            return Err(SettingsError::Invalid(
                "ping duration must be 1..=8 seconds",
            ));
        }
        if self.volume > 100 {
            return Err(SettingsError::Invalid("volume must be 0..=100"));
        }
        if !(80..=300).contains(&self.emote_size_px) {
            return Err(SettingsError::Invalid("emote size must be 80..=300 pixels"));
        }
        if has_duplicates(&self.wheel) {
            return Err(SettingsError::Invalid("ping wheel slots must be distinct"));
        }
        if !is_emote(&self.click_emote_id) || has_duplicates(&self.emote_wheel) {
            return Err(SettingsError::Invalid(
                "emote assignments must use distinct bundled assets",
            ));
        }
        if !self.emote_wheel.iter().all(|id| is_emote(id)) {
            return Err(SettingsError::Invalid(
                "emote assignments must use bundled assets",
            ));
        }
        Ok(())
    }

    /// A missing file means first run. Invalid or oversized files are returned as errors and left untouched.
    pub fn load(path: impl AsRef<Path>) -> Result<Self, SettingsError> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(error) => return Err(error.into()),
        };
        let mut bytes = Vec::new();
        file.take(MAX_SETTINGS_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_SETTINGS_BYTES {
            return Err(SettingsError::Invalid("settings file exceeds 64 KiB"));
        }
        let settings: Self = serde_json::from_slice(&bytes)?;
        settings.validate()?;
        Ok(settings)
    }

    /// Validates before writing, then replaces the file via a flushed same-directory temporary file.
    pub fn save_atomic(&self, path: impl AsRef<Path>) -> Result<(), SettingsError> {
        self.validate()?;
        let path = path.as_ref();
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        fs::create_dir_all(parent)?;
        let bytes = serde_json::to_vec_pretty(self)?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        temporary.write_all(&bytes)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(path)
            .map_err(|error| SettingsError::Io(error.error))?;
        Ok(())
    }
}

pub fn validate_trigger(trigger: Trigger) -> Result<(), SettingsError> {
    if let Trigger::Key { vk } = trigger {
        if !is_vk(vk) || is_modifier_vk(vk) || is_unsafe_trigger_vk(vk) {
            return Err(SettingsError::Invalid(
                "custom trigger key is unsafe or invalid",
            ));
        }
    }
    Ok(())
}

pub fn same_trigger(left: Trigger, right: Trigger) -> bool {
    trigger_vk(left).is_some() && trigger_vk(left) == trigger_vk(right) || left == right
}

pub fn trigger_uses_vk(trigger: Trigger, vk: u8) -> bool {
    trigger_vk(trigger) == Some(vk)
}

pub fn trigger_vk(trigger: Trigger) -> Option<u8> {
    match trigger {
        Trigger::CapsLock => Some(0x14),
        Trigger::Key { vk } => Some(vk),
        _ => None,
    }
}

pub fn is_vk(vk: u8) -> bool {
    (1..=254).contains(&vk)
}

pub fn is_modifier_vk(vk: u8) -> bool {
    matches!(vk, 0x10 | 0x11 | 0x12 | 0x5b | 0x5c | 0xa0..=0xa5)
}

pub fn is_unsafe_trigger_vk(vk: u8) -> bool {
    matches!(vk, 0x08 | 0x09 | 0x0d | 0x1b | 0x20 | 0x25..=0x28)
}

/// Reserved, path-safe IDs for the local custom PNG library; legacy schema stays v1.
pub fn is_custom_emote(id: &str) -> bool {
    id.strip_prefix("custom_").is_some_and(|suffix| {
        suffix.len() == 16
            && suffix
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

pub fn is_emote(id: &str) -> bool {
    EMOTE_ASSETS.contains(&id) || is_custom_emote(id)
}

fn has_duplicates<T: Eq>(values: &[T]) -> bool {
    values
        .iter()
        .enumerate()
        .any(|(i, value)| values[..i].contains(value))
}

// ----------------------------------------------------------------------------------
// Backwards-compatible Settings struct for existing Tauri API & Frontend bindings
// ----------------------------------------------------------------------------------

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
        if self.drag_threshold_px < 2 || self.drag_threshold_px > 500 {
            return Err(format!(
                "Drag threshold must be between 2px and 500px, got {}px",
                self.drag_threshold_px
            ));
        }
        if self.ping_size_px < 20 || self.ping_size_px > 300 {
            return Err(format!(
                "Ping size must be between 20px and 300px, got {}px",
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
    use crate::wheel::model::{DEFAULT_EMOTE_WHEEL, DEFAULT_PING_WHEEL};

    #[test]
    fn custom_emote_ids_keep_schema_v1_and_reject_paths_or_malformed_names() {
        let mut settings = Settings::default();
        settings.emote_wheel[0] = "custom_0123456789abcdef".into();
        settings.click_emote_id = settings.emote_wheel[0].clone();
        settings.validate().unwrap();
        assert_eq!(
            serde_json::from_str::<Settings>(&serde_json::to_string(&settings).unwrap()).unwrap(),
            settings
        );
        for id in [
            "custom_../secret",
            "custom_0123456789abcdeF",
            "custom_0123456789abcdef.png",
            "custom_",
            "unknown",
        ] {
            assert!(!is_custom_emote(id));
            settings.click_emote_id = id.into();
            assert!(settings.validate().is_err());
        }
    }

    #[test]
    fn defaults_match_upstream_wheel_layouts_and_shortcut() {
        let settings = Settings::default();
        settings.validate().unwrap();
        assert_eq!(settings.wheel, DEFAULT_PING_WHEEL);
        assert_eq!(settings.emote_wheel, DEFAULT_EMOTE_WHEEL.map(str::to_owned));
        assert_eq!(
            settings.toggle_hotkey,
            Hotkey {
                mods: ToggleMods::CTRL | ToggleMods::ALT,
                vk: b'P'
            }
        );
    }

    #[test]
    fn rejects_unsafe_conflicting_and_out_of_range_settings() {
        let mut settings = Settings::default();
        settings.toggle_hotkey.mods = ToggleMods(0);
        assert!(settings.validate().is_err());
        settings.toggle_hotkey.mods = ToggleMods::SHIFT;
        assert!(settings.validate().is_err());
        settings.toggle_hotkey.mods = ToggleMods::ALT;
        settings.toggle_hotkey.vk = 0x12; // Alt key
        assert!(settings.validate().is_err());
        settings.toggle_hotkey.vk = b'A';
        settings.trigger = Trigger::Key { vk: b'A' };
        assert!(settings.validate().is_err());
        settings.trigger = Trigger::Alt;
        settings.emote_trigger = Some(Trigger::Alt);
        assert!(settings.validate().is_err());
        settings.emote_trigger = None;
        settings.drag_threshold_px = 1;
        assert!(settings.validate().is_err());
        settings.drag_threshold_px = 41;
        assert!(settings.validate().is_err());
        settings.drag_threshold_px = 8;
        settings.ping_size_px = 59;
        assert!(settings.validate().is_err());
        settings.ping_size_px = 221;
        assert!(settings.validate().is_err());
        settings.ping_size_px = 110;
        settings.volume = 101;
        assert!(settings.validate().is_err());
        settings.volume = 70;
        settings.emote_size_px = 79;
        assert!(settings.validate().is_err());
        settings.emote_size_px = 301;
        assert!(settings.validate().is_err());
        settings.emote_size_px = 150;
        settings.wheel[1] = settings.wheel[0];
        assert!(settings.validate().is_err());
        settings = Settings::default();
        settings.emote_wheel[1] = settings.emote_wheel[0].clone();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn saves_atomically_and_loads_valid_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub/dir/settings.json");
        let mut settings = Settings::default();
        settings.volume = 42;
        settings.save_atomic(&path).unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(settings, loaded);
    }

    #[test]
    fn invalid_files_are_preserved_and_invalid_values_are_never_saved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, b"{ not json").unwrap();
        assert!(matches!(Settings::load(&path), Err(SettingsError::Json(_))));
        assert_eq!(fs::read(&path).unwrap(), b"{ not json");
        let mut invalid = Settings::default();
        invalid.volume = 200;
        assert!(invalid.save_atomic(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{ not json");
    }

    #[test]
    fn oversized_settings_are_rejected_without_rewriting_them() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let huge = vec![b' '; (MAX_SETTINGS_BYTES + 10) as usize];
        fs::write(&path, &huge).unwrap();
        assert!(matches!(Settings::load(&path), Err(SettingsError::Invalid(_))));
    }

    #[test]
    fn legacy_settings_path_remains_stable_for_compatibility() {
        let path = resolve_settings_path("/dummy/roaming");
        assert_eq!(
            path,
            std::path::PathBuf::from("/dummy/roaming/lolPing/settings.json")
        );
    }

    #[test]
    fn test_pingloom_settings_backwards_compatibility() {
        let default_settings = PingloomSettings::default();
        assert!(default_settings.validate().is_ok());
        assert_eq!(default_settings.wheel.len(), 8);
        assert_eq!(default_settings.emote_wheel.len(), 8);
    }
}
