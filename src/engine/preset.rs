use crate::engine::eq::EQBandConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppAudioSettings {
    pub volume: f32, // 0.0 to 1.0 (or > 1.0 for boost)
    pub muted: bool,
    pub target_device_uid: Option<String>,
    pub eq_bypass: bool,
    pub eq_bands: Vec<EQBandConfig>,
}

impl Default for AppAudioSettings {
    fn default() -> Self {
        Self {
            volume: 1.0,
            muted: false,
            target_device_uid: None,
            eq_bypass: false,
            eq_bands: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Preset {
    pub name: String,
    pub is_default: bool,
    pub app_settings: HashMap<String, AppAudioSettings>,
}

impl Preset {
    pub fn new(name: impl Into<String>, is_default: bool) -> Self {
        Self {
            name: name.into(),
            is_default,
            app_settings: HashMap::new(),
        }
    }
}

pub struct PresetStore {
    file_path: PathBuf,
    presets: Vec<Preset>,
}

impl PresetStore {
    pub fn new(file_path: impl Into<PathBuf>) -> Self {
        let path = file_path.into();
        let mut store = Self {
            file_path: path,
            presets: Vec::new(),
        };

        if store.file_path.exists() {
            let _ = store.load();
        } else {
            // Seed with Flat default preset
            store.presets.push(Preset::new("Flat", true));
            let _ = store.save();
        }

        store
    }

    pub fn presets(&self) -> &[Preset] {
        &self.presets
    }

    pub fn get_preset(&self, name: &str) -> Option<&Preset> {
        self.presets.iter().find(|p| p.name == name)
    }

    pub fn set_preset(&mut self, preset: Preset) {
        if let Some(pos) = self.presets.iter().position(|p| p.name == preset.name) {
            self.presets[pos] = preset;
        } else {
            self.presets.push(preset);
        }
        let _ = self.save();
    }

    pub fn delete_preset(&mut self, name: &str) -> bool {
        let initial_len = self.presets.len();
        self.presets.retain(|p| p.name != name);
        if self.presets.len() < initial_len {
            if !self.presets.is_empty() && !self.presets.iter().any(|p| p.is_default) {
                self.presets[0].is_default = true;
            }
            let _ = self.save();
            true
        } else {
            false
        }
    }

    pub fn load(&mut self) -> Result<(), std::io::Error> {
        let content = fs::read_to_string(&self.file_path)?;
        self.presets = serde_json::from_str(&content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(())
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.presets)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        fs::write(&self.file_path, json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_preset_store_crud() {
        let temp_dir = env::temp_dir();
        let path = temp_dir.join(format!("rust_sound_test_{}.json", std::process::id()));

        let mut store = PresetStore::new(&path);
        assert_eq!(store.presets().len(), 1);
        assert_eq!(store.presets()[0].name, "Flat");

        let mut podcast_preset = Preset::new("Podcast", false);
        podcast_preset.app_settings.insert(
            "com.spotify.client".into(),
            AppAudioSettings {
                volume: 0.8,
                muted: false,
                target_device_uid: Some("BuiltInSpeaker".into()),
                eq_bypass: false,
                eq_bands: vec![],
            },
        );

        store.set_preset(podcast_preset);
        assert_eq!(store.presets().len(), 2);

        // Reload from disk
        let reloaded = PresetStore::new(&path);
        assert_eq!(reloaded.presets().len(), 2);
        assert!(reloaded.get_preset("Podcast").is_some());

        let _ = fs::remove_file(path);
    }
}
