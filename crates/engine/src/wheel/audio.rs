//! Audio sound file mapping and resolution for pingloom wheel and gestures.

use super::model::{EMOTE_ASSETS, PING_ASSETS};

/// All 22 bundled pingloom sound effects (.ogg files in assets/sounds).
pub const SOUND_FILES: &[&str] = &[
    "AreaIsWarded.ogg",
    "Attack.ogg",
    "Base.ogg",
    "Click.ogg",
    "ComeHere.ogg",
    "Danger.ogg",
    "Defend.ogg",
    "GetBack.ogg",
    "MIA.ogg",
    "OnMyWay.ogg",
    "OnMyWay_Close.ogg",
    "OnMyWay_Far.ogg",
    "OnMyWay_caster.ogg",
    "OnMyWay_recipient.ogg",
    "SRP_11.ogg",
    "SRP_12.ogg",
    "SRP_13.ogg",
    "SRP_4.ogg",
    "SRP_6.ogg",
    "SRP_7.ogg",
    "SRP_9.ogg",
    "button.ogg",
];

/// Known ping id to sound file mappings.
pub const PING_SOUND_MAP: &[(&str, &str)] = &[
    ("danger", "Danger.ogg"),
    ("push", "SRP_9.ogg"),
    ("omw", "OnMyWay.ogg"),
    ("onmyway", "OnMyWay.ogg"),
    ("allin", "SRP_4.ogg"),
    ("all_in", "SRP_4.ogg"),
    ("assist", "ComeHere.ogg"),
    ("needvision", "SRP_7.ogg"),
    ("need_vision", "SRP_7.ogg"),
    ("missing", "MIA.ogg"),
    ("enemy_missing", "MIA.ogg"),
    ("mia", "MIA.ogg"),
    ("enemyvision", "AreaIsWarded.ogg"),
    ("enemy_vision", "AreaIsWarded.ogg"),
    ("generic", "Base.ogg"),
    ("alert", "Base.ogg"),
    ("bait", "SRP_11.ogg"),
    ("visioncleared", "SRP_6.ogg"),
    ("vision_cleared", "SRP_6.ogg"),
    ("retreat", "Danger.ogg"),
    ("target_enemy", "Attack.ogg"),
    ("hold_position", "Defend.ogg"),
    ("button", "button.ogg"),
    ("tick", "button.ogg"),
    ("click", "Click.ogg"),
];

/// Resolves an input identifier (sound filename, ping ID, or emote slug)
/// into a relative asset subpath (e.g. "sounds/Danger.ogg" or "emotes/gg_heart.ogg").
pub fn resolve_sound_filename(name: &str) -> Option<String> {
    let clean = name.trim();
    if clean.is_empty() {
        return None;
    }

    // 1. Direct or stripped subpath check
    let clean_lower = clean.to_ascii_lowercase();
    let without_prefix = clean
        .strip_prefix("sounds/")
        .or_else(|| clean.strip_prefix("emotes/"))
        .unwrap_or(clean);
    let without_prefix_lower = without_prefix.to_ascii_lowercase();

    // 2. Check exact or case-insensitive match against bundled sound files
    for &sound in SOUND_FILES {
        let sound_stem = sound.strip_suffix(".ogg").unwrap_or(sound);
        if without_prefix.eq_ignore_ascii_case(sound)
            || without_prefix.eq_ignore_ascii_case(sound_stem)
            || clean_lower == sound.to_ascii_lowercase()
            || clean_lower == sound_stem.to_ascii_lowercase()
        {
            return Some(format!("sounds/{}", sound));
        }
    }

    // 3. Check tactical ping identifier table
    let check_key = without_prefix_lower
        .strip_suffix(".ogg")
        .unwrap_or(&without_prefix_lower);
    for &(id, sound_file) in PING_SOUND_MAP {
        if check_key == id {
            return Some(format!("sounds/{}", sound_file));
        }
    }

    // 4. Check PING_ASSETS list
    for asset in PING_ASSETS {
        let asset_id_str = match asset.id {
            super::model::PingId::Danger => "danger",
            super::model::PingId::Push => "push",
            super::model::PingId::OnMyWay => "omw",
            super::model::PingId::AllIn => "allin",
            super::model::PingId::Assist => "assist",
            super::model::PingId::NeedVision => "needvision",
            super::model::PingId::Missing => "missing",
            super::model::PingId::EnemyVision => "enemyvision",
            super::model::PingId::Generic => "generic",
            super::model::PingId::Bait => "bait",
            super::model::PingId::VisionCleared => "visioncleared",
        };
        if check_key == asset_id_str || check_key == asset.name.to_ascii_lowercase() {
            // Check if asset.sound matches a known file
            let sound_candidate = format!("{}.ogg", asset.sound);
            if SOUND_FILES.iter().any(|s| s.eq_ignore_ascii_case(&sound_candidate)) {
                return Some(format!("sounds/{}", sound_candidate));
            }
        }
    }

    // 5. Check EMOTE_ASSETS
    for &emote_slug in EMOTE_ASSETS {
        if check_key == emote_slug || without_prefix_lower == format!("{}.ogg", emote_slug) {
            return Some(format!("emotes/{}.ogg", emote_slug));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_sound_filename_direct_sound_files() {
        assert_eq!(
            resolve_sound_filename("Danger.ogg"),
            Some("sounds/Danger.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("danger.ogg"),
            Some("sounds/Danger.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("Danger"),
            Some("sounds/Danger.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("OnMyWay.ogg"),
            Some("sounds/OnMyWay.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("SRP_12.ogg"),
            Some("sounds/SRP_12.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("button.ogg"),
            Some("sounds/button.ogg".to_string())
        );
    }

    #[test]
    fn test_resolve_sound_filename_ping_ids() {
        assert_eq!(
            resolve_sound_filename("danger"),
            Some("sounds/Danger.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("omw"),
            Some("sounds/OnMyWay.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("push"),
            Some("sounds/SRP_9.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("allin"),
            Some("sounds/SRP_4.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("missing"),
            Some("sounds/MIA.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("enemyvision"),
            Some("sounds/AreaIsWarded.ogg".to_string())
        );
    }

    #[test]
    fn test_resolve_sound_filename_emotes() {
        assert_eq!(
            resolve_sound_filename("gg_heart"),
            Some("emotes/gg_heart.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("bee_happy"),
            Some("emotes/bee_happy.ogg".to_string())
        );
        assert_eq!(
            resolve_sound_filename("angry_kitty.ogg"),
            Some("emotes/angry_kitty.ogg".to_string())
        );
    }

    #[test]
    fn test_resolve_sound_filename_invalid() {
        assert_eq!(resolve_sound_filename(""), None);
        assert_eq!(resolve_sound_filename("non_existent_file_xyz"), None);
    }
}
