use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub category: String, // "ping" | "emote"
}

pub const DEFAULT_PING_CATALOG: &[(&str, &str, &str, &str)] = &[
    ("danger", "Danger", "pingwheel_retreatrender", "#ff3b55"),
    ("push", "Push", "push", "#35d27a"),
    ("omw", "On My Way", "omw", "#2e8bff"),
    ("allin", "All In", "all_in", "#f2b320"),
    ("assist", "Assist Me", "assist_me", "#56d43c"),
    ("needvision", "Need Vision", "need_vision", "#56d43c"),
    ("missing", "Enemy Missing", "enemy_missing", "#f2c518"),
    ("enemyvision", "Enemy Vision", "enemy_vision", "#ff4a3b"),
    ("generic", "Attention Ping", "generic_alert", "#38bdf8"),
    ("bait", "Bait", "bait", "#f59e0b"),
    ("visioncleared", "Vision Cleared", "vision_cleared", "#ec4899"),
];

pub const DEFAULT_EMOTE_CATALOG: &[(&str, &str, &str, &str)] = &[
    ("come_at_me", "Come At Me", "come_at_me", "#f43f5e"),
    ("now_see_here", "Now See Here", "now_see_here", "#3b82f6"),
    ("does_not_compute", "Does Not Compute", "does_not_compute", "#8b5cf6"),
    ("sweating_blitzcrank", "Sweating Blitzcrank", "sweating_blitzcrank", "#eab308"),
    ("unworthy_cn", "Unworthy", "unworthy_cn", "#ef4444"),
    ("gg_heart", "GG Heart", "gg_heart", "#ec4899"),
    ("bee_happy", "Bee Happy", "bee_happy", "#fbbf24"),
    ("bee_mad", "Bee Mad", "bee_mad", "#f97316"),
];

pub fn get_default_catalog() -> Vec<CatalogEntry> {
    let mut catalog = Vec::new();
    for (id, name, icon, color) in DEFAULT_PING_CATALOG {
        catalog.push(CatalogEntry {
            id: id.to_string(),
            name: name.to_string(),
            icon: icon.to_string(),
            color: color.to_string(),
            category: "ping".to_string(),
        });
    }
    for (id, name, icon, color) in DEFAULT_EMOTE_CATALOG {
        catalog.push(CatalogEntry {
            id: id.to_string(),
            name: name.to_string(),
            icon: icon.to_string(),
            color: color.to_string(),
            category: "emote".to_string(),
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
