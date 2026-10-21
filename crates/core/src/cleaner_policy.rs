//! How much trust each cleanup category deserves.
//!
//! The scanner finds both kinds of thing in one pass: caches that regenerate themselves,
//! and files the person put there on purpose. Pre-ticking all of it treats an emptied
//! Trash the same as a rebuilt npm cache, so every category carries a rating and the UI
//! only pre-selects what it can safely reclaim.
//!
//! Anything unrecognised is [`CleanRisk::Review`] on purpose: a category added later and
//! never classified must ask before it deletes, not assume it may.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanRisk {
    /// Regenerates itself. The cost of deleting it is a slower next run.
    Safe,
    /// Holds something the person chose to keep, or cannot be rebuilt.
    Review,
}

impl CleanRisk {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Review => "review",
        }
    }
}

/// Caches, temp files and logs: deleting them costs time, never data.
const SAFE_CATEGORIES: &[&str] = &[
    // System scratch
    "win_temp",
    "user_caches",
    "system_logs",
    "win_crash_dumps",
    "win_d3d_cache",
    "win_wer",
    // Package and build caches, all re-downloadable or rebuildable
    "cargo_cache",
    "npm_cache",
    "pnpm_cache",
    "pip_cache",
    "nuget_cache",
    "gradle_cache",
    "homebrew_cache",
    "xcode_derived_data",
    "xcode_simulators",
    // Browser caches hold fetched assets, not logins or history
    "chrome_cache",
    "edge_cache",
    "brave_cache",
    "firefox_cache",
    "safari_cache",
    "arc_cache",
];

/// Why a category is not pre-selected, in the words shown next to its checkbox.
const REVIEW_NOTES: &[(&str, &str)] = &[
    (
        "system_trash",
        "These are your own deleted files. Emptying the Trash cannot be undone.",
    ),
    (
        "installer_files",
        "Installers sitting in Downloads. Check the list before deleting them.",
    ),
    (
        "win_installer_files",
        "Installers sitting in Downloads. Check the list before deleting them.",
    ),
    (
        "xcode_archives",
        "Distribution archives of builds you shipped. Rebuilding is the only way back.",
    ),
];

pub fn risk_for(category_id: &str) -> CleanRisk {
    if SAFE_CATEGORIES.contains(&category_id) {
        CleanRisk::Safe
    } else {
        CleanRisk::Review
    }
}

pub fn risk_note(category_id: &str) -> Option<&'static str> {
    REVIEW_NOTES
        .iter()
        .find(|(id, _)| *id == category_id)
        .map(|(_, note)| *note)
        .or_else(|| {
            (risk_for(category_id) == CleanRisk::Review)
                .then_some("Not recognised as a regenerable cache, so it is left unticked.")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regenerable_caches_are_safe_and_the_rest_needs_a_look() {
        for id in SAFE_CATEGORIES {
            assert_eq!(risk_for(id), CleanRisk::Safe, "{id}");
            assert_eq!(risk_note(id), None, "{id} needs no warning");
        }
        for (id, _) in REVIEW_NOTES {
            assert_eq!(risk_for(id), CleanRisk::Review, "{id}");
            assert!(risk_note(id).is_some(), "{id} must explain itself");
        }
    }

    #[test]
    fn the_trash_and_the_downloads_folder_are_never_pre_selected() {
        // These hold files the person chose to keep. The whole point of the rating is
        // that a one-click clean cannot take them.
        for id in ["system_trash", "installer_files", "win_installer_files"] {
            assert_eq!(risk_for(id), CleanRisk::Review, "{id}");
        }
    }

    #[test]
    fn an_unclassified_category_asks_first_instead_of_assuming() {
        assert_eq!(risk_for("some_future_category"), CleanRisk::Review);
        assert!(risk_note("some_future_category").is_some());
        assert_eq!(risk_for(""), CleanRisk::Review);
    }

    #[test]
    fn the_rating_serialises_as_the_string_the_ui_switches_on() {
        assert_eq!(CleanRisk::Safe.as_str(), "safe");
        assert_eq!(CleanRisk::Review.as_str(), "review");
        assert_eq!(
            serde_json::to_string(&CleanRisk::Review).unwrap(),
            "\"review\""
        );
    }
}
