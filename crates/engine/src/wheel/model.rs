use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PingId {
    Danger,
    Push,
    #[serde(rename = "omw")]
    OnMyWay,
    #[serde(rename = "allin")]
    AllIn,
    Assist,
    #[serde(rename = "needvision")]
    NeedVision,
    Missing,
    #[serde(rename = "enemyvision")]
    EnemyVision,
    Generic,
    Bait,
    #[serde(rename = "visioncleared")]
    VisionCleared,
}

impl PingId {
    pub const ALL: [Self; 11] = [
        Self::Danger,
        Self::Push,
        Self::OnMyWay,
        Self::AllIn,
        Self::Assist,
        Self::NeedVision,
        Self::Missing,
        Self::EnemyVision,
        Self::Generic,
        Self::Bait,
        Self::VisionCleared,
    ];

    pub const fn asset(self) -> &'static PingAsset {
        &PING_ASSETS[self as usize]
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Danger => "danger",
            Self::Push => "push",
            Self::OnMyWay => "omw",
            Self::AllIn => "allin",
            Self::Assist => "assist",
            Self::NeedVision => "needvision",
            Self::Missing => "missing",
            Self::EnemyVision => "enemyvision",
            Self::Generic => "generic",
            Self::Bait => "bait",
            Self::VisionCleared => "visioncleared",
        }
    }
}

pub const DEFAULT_PING_WHEEL: [PingId; 8] = [
    PingId::Danger,
    PingId::Push,
    PingId::OnMyWay,
    PingId::AllIn,
    PingId::Assist,
    PingId::NeedVision,
    PingId::Missing,
    PingId::EnemyVision,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PingAsset {
    pub id: PingId,
    pub name: &'static str,
    pub icon: &'static str,
    pub art: &'static [&'static str],
    pub sound: &'static str,
    pub color: &'static str,
}

pub const PING_ASSETS: [PingAsset; 11] = [
    PingAsset {
        id: PingId::Danger,
        name: "Danger",
        icon: "pingwheel_retreatrender",
        art: &["pingwheel_retreatrender"],
        sound: "SRP_12",
        color: "#ff3b55",
    },
    PingAsset {
        id: PingId::Push,
        name: "Push",
        icon: "push",
        art: &["pingwheel_pushrender"],
        sound: "SRP_9",
        color: "#35d27a",
    },
    PingAsset {
        id: PingId::OnMyWay,
        name: "On My Way",
        icon: "omw",
        art: &["omw"],
        sound: "OnMyWay",
        color: "#2e8bff",
    },
    PingAsset {
        id: PingId::AllIn,
        name: "All In",
        icon: "all_in",
        art: &["pingwheel_allin_render_01", "pingwheel_allin_render_02"],
        sound: "SRP_4",
        color: "#f2b320",
    },
    PingAsset {
        id: PingId::Assist,
        name: "Assist Me",
        icon: "assist_me",
        art: &["assist_me"],
        sound: "ComeHere",
        color: "#56d43c",
    },
    PingAsset {
        id: PingId::NeedVision,
        name: "Need Vision",
        icon: "need_vision",
        art: &["need_vision"],
        sound: "SRP_7",
        color: "#56d43c",
    },
    PingAsset {
        id: PingId::Missing,
        name: "Enemy Missing",
        icon: "enemy_missing",
        art: &["enemy_missing"],
        sound: "MIA",
        color: "#f2c518",
    },
    PingAsset {
        id: PingId::EnemyVision,
        name: "Enemy Vision",
        icon: "enemy_vision",
        art: &["pingwheel_enemyvisionrender"],
        sound: "AreaIsWarded",
        color: "#ff3b55",
    },
    PingAsset {
        id: PingId::Generic,
        name: "Generic",
        icon: "generic_ping",
        art: &["pingwheel_basicpingrender"],
        sound: "Base",
        color: "#2e8bff",
    },
    PingAsset {
        id: PingId::Bait,
        name: "Bait",
        icon: "pingwheel_baitrender",
        art: &["pingwheel_baitrender"],
        sound: "SRP_11",
        color: "#efbc12",
    },
    PingAsset {
        id: PingId::VisionCleared,
        name: "Vision Cleared",
        icon: "vision_cleared",
        art: &["pingwheel_visionclearedrender"],
        sound: "SRP_6",
        color: "#2b80ff",
    },
];

pub const DEFAULT_CLICK_PING: PingId = PingId::Generic;
pub const TICK_SOUND: &str = "button";
pub const FALLBACK_TEXTURE: &str = "generic_ping";

/// Built-in League emote asset slugs.
pub const EMOTE_ASSETS: &[&str] = &[
    "facepalm",
    "unworthy",
    "unworthy_cn",
    "poro_snax",
    "sad_kitten",
    "cheeky_poro",
    "angry_kitty",
    "gg_heart",
    "bee_happy",
    "bee_mad",
    "bee_sad",
    "snoozy_poro",
    "wahaha",
    "omg_love_it",
    "poro_ride",
    "dont_make_me_laugh",
    "woah_dizzy",
    "haha_hilarious",
    "gasp",
    "super_approved",
    "pain",
    "laughing_out_loud",
    "hats_off",
    "call_me",
    "think_about_it",
    "unimpressed",
    "did_you_just",
    "nice_try",
    "nice",
    "despair",
    "does_not_compute",
    "come_at_me",
    "how_could_you",
    "scout_approved",
    "maybe_next_time",
    "okay",
    "good_job_buddy",
    "teamwork",
    "i_will_destroy_you",
    "not_today",
    "oh",
    "come_again",
    "magpie_oopsie",
    "such_foolishness",
    "now_see_here",
    "let_s_do_this",
    "long_road_ahead",
    "sweating_blitzcrank",
];

pub const DEFAULT_EMOTE_WHEEL: [&str; 8] = [
    "come_at_me",
    "now_see_here",
    "does_not_compute",
    "sweating_blitzcrank",
    "unworthy_cn",
    "gg_heart",
    "bee_happy",
    "bee_mad",
];
pub const DEFAULT_CLICK_EMOTE: &str = "facepalm";

pub type EmoteId = String;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Trigger {
    Alt,
    Ctrl,
    Shift,
    Win,
    CapsLock,
    Mouse4,
    Mouse5,
    Key { vk: u8 },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WheelKind {
    Ping,
    Emote,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Button {
    Left,
    Right,
    Middle,
    X1,
    X2,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum InputEvent {
    KeyDown {
        vk: u8,
        injected: bool,
    },
    KeyUp {
        vk: u8,
        injected: bool,
    },
    PointerDown {
        button: Button,
        point: Point,
        time_ms: u64,
        injected: bool,
        /// True when a fullscreen app owns this point; only consulted for a gesture candidate.
        fullscreen_app: bool,
        /// Physical pixels per DIP on the display containing this gesture origin.
        dpi_scale: f64,
    },
    PointerUp {
        button: Button,
        point: Point,
        time_ms: u64,
        injected: bool,
    },
    PointerMove {
        point: Point,
        time_ms: u64,
        injected: bool,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Action {
    WheelOpen {
        wheel: WheelKind,
        origin: Point,
    },
    WheelMove {
        wheel: WheelKind,
        point: Point,
        slot: Option<usize>,
    },
    Select {
        wheel: WheelKind,
        slot: usize,
        point: Point,
    },
    Click {
        wheel: WheelKind,
        point: Point,
    },
    Cancel,
    Toggled {
        enabled: bool,
    },
    Sound {
        sound: String,
    },
}

// ----------------------------------------------------------------------------------
// Backwards compatibility structures for Tauri frontend and test suites
// ----------------------------------------------------------------------------------

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_identity_tables_match_enum_order_and_default_assignments() {
        assert!(PingId::ALL
            .iter()
            .enumerate()
            .all(|(i, id)| PING_ASSETS[i].id == *id));
        assert_eq!(DEFAULT_PING_WHEEL[0], PingId::Danger);
        assert!(DEFAULT_EMOTE_WHEEL
            .iter()
            .all(|id| EMOTE_ASSETS.contains(id)));
        assert!(DEFAULT_CLICK_EMOTE == EMOTE_ASSETS[0]);
        assert!(PING_ASSETS.iter().all(|asset| !asset.art.is_empty()));
    }
}
