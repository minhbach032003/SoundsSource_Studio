use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
        let bundle_raw = bundle_id.into();
        let name_raw = name.into();

        Self {
            object_id,
            pid,
            bundle_id: Self::normalize_bundle_id(bundle_raw.trim()),
            name: name_raw.trim().to_string(),
            is_running_output,
            is_regular_app,
        }
    }

    /// Strips trailing `.helper`, `.renderer`, etc. from bundle IDs so sub-processes
    /// fold cleanly into their primary application entry.
    pub fn normalize_bundle_id(bundle_id: &str) -> String {
        let mut parts: Vec<&str> = bundle_id.split('.').collect();
        while parts.len() > 2 {
            if let Some(last) = parts.last() {
                let lower = last.to_ascii_lowercase();
                if lower == "helper" || lower == "renderer" || lower == "gpu" {
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
        assert!(AudioProcess::is_helper_like_name("Google Chrome Helper"));
        assert!(AudioProcess::is_helper_like_name("Discord Helper (Renderer)"));
        assert!(!AudioProcess::is_helper_like_name("Spotify"));
    }
}
