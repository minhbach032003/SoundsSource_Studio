use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub category: String, // "tactical" | "objectives" | "emotes" | "audio"
}

pub const DEFAULT_PING_CATALOG: &[(&str, &str, &str, &str, &str)] = &[
    ("danger", "Danger / Retreat", "pingwheel_retreatrender", "#ff3b55", "tactical"),
    ("push", "Push Lane", "push", "#35d27a", "tactical"),
    ("omw", "On My Way", "omw", "#2e8bff", "tactical"),
    ("allin", "All In / Engage", "all_in", "#f2b320", "tactical"),
    ("assist", "Assist Me", "assist_me", "#56d43c", "tactical"),
    ("needvision", "Need Vision", "need_vision", "#56d43c", "tactical"),
    ("missing", "Enemy Missing", "enemy_missing", "#f2c518", "tactical"),
    ("enemyvision", "Enemy Vision Here", "enemy_vision", "#ff4a3b", "tactical"),
    ("generic", "Attention / Alert", "generic_alert", "#38bdf8", "tactical"),
    ("bait", "Bait Enemy", "bait", "#f59e0b", "tactical"),
    ("visioncleared", "Vision Cleared", "vision_cleared", "#ec4899", "tactical"),
    ("retreat", "Fall Back", "retreat", "#ef4444", "tactical"),
    ("target_enemy", "Target Focus", "target_focus", "#e11d48", "tactical"),
    ("hold_position", "Hold Position", "hold_pos", "#6366f1", "tactical"),
    ("heal_me", "Need Heal", "heal", "#10b981", "tactical"),
    ("out_of_mana", "Out of Mana", "mana", "#0ea5e9", "tactical"),
    ("ult_ready", "Ultimate Ready", "ult_ready", "#a855f7", "tactical"),

    ("baron", "Baron Nashor", "baron", "#a855f7", "objectives"),
    ("dragon", "Elder Dragon", "dragon", "#f97316", "objectives"),
    ("herald", "Rift Herald", "herald", "#ec4899", "objectives"),
    ("turret", "Tower / Turret", "turret", "#f59e0b", "objectives"),
    ("ward_pink", "Control Ward", "ward_pink", "#f43f5e", "objectives"),
    ("ward_yellow", "Stealth Ward", "ward_yellow", "#eab308", "objectives"),
    ("group_up", "Group Up Now", "group", "#06b6d4", "objectives"),
    ("farm_wave", "Catch Minion Wave", "farm", "#84cc16", "objectives"),
];

pub const DEFAULT_EMOTE_CATALOG: &[(&str, &str, &str, &str, &str)] = &[
    ("come_at_me", "Come At Me", "come_at_me", "#f43f5e", "emotes"),
    ("now_see_here", "Now See Here", "now_see_here", "#3b82f6", "emotes"),
    ("does_not_compute", "Does Not Compute", "does_not_compute", "#8b5cf6", "emotes"),
    ("sweating_blitzcrank", "Sweating Blitz", "sweating_blitzcrank", "#eab308", "emotes"),
    ("unworthy_cn", "Unworthy", "unworthy_cn", "#ef4444", "emotes"),
    ("gg_heart", "GG Heart", "gg_heart", "#ec4899", "emotes"),
    ("bee_happy", "Bee Happy", "bee_happy", "#fbbf24", "emotes"),
    ("bee_mad", "Bee Mad", "bee_mad", "#f97316", "emotes"),
    ("thumbs_up", "Thumbs Up", "thumbs_up", "#22c55e", "emotes"),
    ("mind_blown", "Mind Blown", "mind_blown", "#ec4899", "emotes"),
    ("thinking", "Thinking Face", "thinking", "#06b6d4", "emotes"),
    ("crown_champ", "Champion Crown", "crown", "#eab308", "emotes"),
    ("hundred", "100 Percent", "hundred", "#ef4444", "emotes"),
    ("flex_muscle", "Flex Muscle", "flex", "#f59e0b", "emotes"),
    ("skull_rip", "RIP Skull", "skull", "#94a3b8", "emotes"),

    ("mic_on", "Mic Open", "mic_on", "#10b981", "audio"),
    ("mic_off", "Mic Muted", "mic_off", "#f43f5e", "audio"),
    ("vol_boost", "Volume Boost", "vol_boost", "#8b5cf6", "audio"),
    ("bass_kick", "Bass Drop", "bass_kick", "#f59e0b", "audio"),
    ("studio_eq", "Studio Acoustic", "studio_eq", "#38bdf8", "audio"),
];

pub fn get_default_catalog() -> Vec<CatalogEntry> {
    let mut catalog = Vec::new();
    for (id, name, icon, color, category) in DEFAULT_PING_CATALOG {
        catalog.push(CatalogEntry {
            id: id.to_string(),
            name: name.to_string(),
            icon: icon.to_string(),
            color: color.to_string(),
            category: category.to_string(),
        });
    }
    for (id, name, icon, color, category) in DEFAULT_EMOTE_CATALOG {
        catalog.push(CatalogEntry {
            id: id.to_string(),
            name: name.to_string(),
            icon: icon.to_string(),
            color: color.to_string(),
            category: category.to_string(),
        });
    }
    catalog
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct GestureResult {
    pub slice_index: usize,
    pub direction: String,
    pub ping_id: String,
    pub ping_name: String,
    pub color: String,
}
