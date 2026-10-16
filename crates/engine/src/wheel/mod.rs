pub mod audio;
pub mod geometry;
pub mod gesture;
pub mod model;
pub mod settings;

pub use audio::{resolve_sound_filename, PING_SOUND_MAP, SOUND_FILES};

pub use geometry::{
    display_at_physical, physical_to_dip, physical_to_local, pick_slice, select_slot,
    select_slot_scaled, DisplayMap, MappedPoint, PointF, Rect, RectF, DIRECTIONS, DIRECTION_LABELS,
    WHEEL_INNER_RADIUS,
};
pub use gesture::{
    GestureEngine, GestureState, InputDecision, ReplayInput, GESTURE_WATCHDOG_MS, VK_MASK_MENU,
};
pub use model::{
    get_default_catalog, Action, Button, CatalogEntry, EmoteId, GestureResult, InputEvent, PingAsset,
    PingId, Point, Trigger, WheelKind, DEFAULT_CLICK_EMOTE, DEFAULT_CLICK_PING,
    DEFAULT_EMOTE_CATALOG, DEFAULT_EMOTE_WHEEL, DEFAULT_PING_CATALOG, DEFAULT_PING_WHEEL,
    EMOTE_ASSETS, PING_ASSETS, TICK_SOUND,
};
pub use settings::{
    is_custom_emote, is_emote, resolve_settings_path, Hotkey, PingloomSettings, Settings,
    SettingsError, ToggleMods, LEGACY_SETTINGS_DIR_NAME, SETTINGS_FILE_NAME,
};
