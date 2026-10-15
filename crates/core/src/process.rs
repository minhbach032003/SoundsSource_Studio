use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioProcess {
    pub object_id: u32,
    pub pid: i32,
    pub bundle_id: String,
    pub name: String,
    pub is_running_output: bool,
    pub is_regular_app: bool,
}

impl AudioProcess {
    pub fn new(
        object_id: u32,
        pid: i32,
        bundle_id: impl Into<String>,
        name: impl Into<String>,
        is_running_output: bool,
        is_regular_app: bool,
    ) -> Self {
        Self {
            object_id,
            pid,
            bundle_id: bundle_id.into(),
            name: name.into(),
            is_running_output,
            is_regular_app,
        }
    }

    /// Enumerate active audio processes across the current platform.
    pub fn enumerate_system_processes() -> Vec<AudioProcess> {
        crate::platform::current::enumerate_system_processes()
    }

    /// Set volume for a process by bundle ID or PID on the current platform.
    pub fn set_app_volume(bundle_or_pid: &str, volume: f32) {
        crate::platform::current::set_app_volume(bundle_or_pid, volume);
    }

    /// Set mute state for a process by bundle ID or PID on the current platform.
    pub fn set_app_mute(bundle_or_pid: &str, muted: bool) {
        crate::platform::current::set_app_mute(bundle_or_pid, muted);
    }

    /// Normalize bundle ID by stripping trailing helper/renderer segments.
    pub fn normalize_bundle_id(raw: &str) -> String {
        let mut parts: Vec<&str> = raw.split('.').collect();
        while let Some(&last) = parts.last() {
            let lower = last.to_ascii_lowercase();
            if lower == "helper"
                || lower == "renderer"
                || lower == "gpu"
                || lower == "plugin"
                || lower == "service"
                || lower.starts_with("helper(")
            {
                if parts.len() > 1 {
                    parts.pop();
                    continue;
                }
            }
            break;
        }

        parts.join(".")
    }

    /// Check if process name is a helper, renderer, or worker subprocess.
    pub fn is_helper_like_name(name: &str) -> bool {
        let lower = name.trim().to_ascii_lowercase();
        let keywords = ["helper", "renderer", "gpuprocess", "webcontent", "serviceworker"];
        let clean = lower.replace(' ', "");

        for kw in keywords {
            if clean.contains(kw) {
                return true;
            }
        }
        false
    }

    pub fn is_non_audio_utility(bundle_id: &str, app_name: &str) -> bool {
        let b = bundle_id.to_ascii_lowercase();
        let n = app_name.to_ascii_lowercase();

        if b.starts_with("com.apple.textedit")
            || b.starts_with("com.apple.preview")
            || b.starts_with("com.apple.calculator")
            || b.starts_with("com.apple.notes")
            || b.starts_with("com.apple.reminders")
            || b.starts_with("com.apple.systempreferences")
            || b.starts_with("com.apple.preferences")
            || b.starts_with("com.apple.appstore")
            || b.starts_with("com.apple.dt.xcode")
            || b.starts_with("com.apple.photos")
            || b.starts_with("com.apple.clock")
            || b.starts_with("com.apple.maps")
            || b.starts_with("com.apple.weather")
            || b.starts_with("com.apple.stocks")
            || b.starts_with("com.apple.home")
            || b.starts_with("com.apple.fontbook")
            || b.starts_with("com.apple.keychainaccess")
            || b.starts_with("com.apple.diskutility")
            || b.starts_with("com.apple.console")
            || b.starts_with("com.apple.activitymonitor")
            || b.starts_with("com.apple.terminal")
            || b.starts_with("com.apple.finder")
            || b == "systemsoundserverd"
            || b == "com.apple.audio.audiocomponentregistrar"
        {
            return true;
        }

        if n == "textedit"
            || n == "preview"
            || n == "calculator"
            || n == "notes"
            || n == "reminders"
            || n == "xcode"
            || n == "terminal"
            || n == "activity monitor"
            || n == "finder"
            || n == "rust-sound"
        {
            return true;
        }

        false
    }

    pub fn is_audio_capable_app(bundle_id: &str, app_name: &str) -> bool {
        if Self::is_non_audio_utility(bundle_id, app_name) {
            return false;
        }

        let b = bundle_id.to_ascii_lowercase();
        let n = app_name.to_ascii_lowercase();

        b.contains("spotify")
            || b.contains("music")
            || b.contains("podcasts")
            || b.contains("quicktime")
            || b.contains("chrome")
            || b.contains("safari")
            || b.contains("brave")
            || b.contains("firefox")
            || b.contains("edge")
            || b.contains("arc")
            || b.contains("opera")
            || b.contains("discord")
            || b.contains("telegram")
            || b.contains("zalo")
            || b.contains("slack")
            || b.contains("teams")
            || b.contains("zoom")
            || b.contains("skype")
            || b.contains("whatsapp")
            || b.contains("vlc")
            || b.contains("iina")
            || b.contains("youtube")
            || b.contains("netflix")
            || b.contains("audacity")
            || b.contains("logic")
            || b.contains("ableton")
            || b.contains("reaper")
            || b.contains("flstudio")
            || b.contains("protools")
            || b.contains("garageband")
            || b.contains("sound")
            || b.contains("voice")
            || b.contains("media")
            || b.contains("player")
            || b.contains("audio")
            || n.contains("spotify")
            || n.contains("music")
            || n.contains("browser")
            || n.contains("chrome")
            || n.contains("safari")
            || n.contains("brave")
            || n.contains("telegram")
            || n.contains("zalo")
            || n.contains("discord")
            || n.contains("slack")
            || n.contains("teams")
            || n.contains("zoom")
            || n.contains("vlc")
            || n.contains("player")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_bundle_id() {
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.google.Chrome.helper"),
            "com.google.Chrome"
        );
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.discordapp.Discord.renderer"),
            "com.discordapp.Discord"
        );
        assert_eq!(
            AudioProcess::normalize_bundle_id("com.spotify.client"),
            "com.spotify.client"
        );
    }

    #[test]
    fn test_helper_name_check() {
        assert!(AudioProcess::is_helper_like_name("Google Chrome Helper (Renderer)"));
        assert!(AudioProcess::is_helper_like_name("Discord Helper"));
        assert!(AudioProcess::is_helper_like_name("Brave Browser Helper (GPU)"));
        assert!(!AudioProcess::is_helper_like_name("Spotify"));
        assert!(!AudioProcess::is_helper_like_name("Logic Pro"));
    }

    #[test]
    fn test_non_audio_utility_filter() {
        assert!(AudioProcess::is_non_audio_utility("com.apple.finder", "Finder"));
        assert!(AudioProcess::is_non_audio_utility("com.apple.Terminal", "Terminal"));
        assert!(!AudioProcess::is_non_audio_utility("com.spotify.client", "Spotify"));
        assert!(!AudioProcess::is_non_audio_utility("com.brave.Browser", "Brave Browser"));
    }

    #[test]
    fn test_audio_capable_app_classification() {
        assert!(AudioProcess::is_audio_capable_app("com.spotify.client", "Spotify"));
        assert!(AudioProcess::is_audio_capable_app("com.google.Chrome", "Google Chrome"));
        assert!(AudioProcess::is_audio_capable_app("com.hnc.Discord", "Discord"));
        assert!(!AudioProcess::is_audio_capable_app("com.apple.finder", "Finder"));
    }
}
