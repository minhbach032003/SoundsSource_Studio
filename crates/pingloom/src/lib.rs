//! Native desktop ping and emote gestures for rust-sound.

pub mod animation;
pub mod custom_emotes;
pub mod geometry;
pub mod gesture;
pub mod model;
pub mod settings;
pub mod wheel;

#[cfg(target_os = "macos")]
pub mod macos_input;

#[cfg(target_os = "macos")]
pub use macos_input::{
    is_accessibility_trusted, start_gesture_monitor, ActionCallback, NativeGestureListener,
    PERMISSION_MESSAGE,
};

pub use animation::{
    guess_format, has_animation, playback_ms, validate_dimensions, AnimatedFrame, ImageFormat,
    MAX_DECODED_BYTES, MAX_DURATION_MS, MAX_FRAMES, MAX_IMAGE_DIMENSION,
};
pub use custom_emotes::{
    animated, catalog, exists, import, import_into, initialize as initialize_custom_emotes, media,
    read_file, stored, MAX_FILES, MAX_INPUT_BYTES, MAX_LIBRARY_BYTES,
};
pub use geometry::{
    display_at_physical, physical_to_dip, physical_to_local, pick_slice, select_slot,
    select_slot_scaled, DisplayMap, MappedPoint, PointF, Rect, RectF, WHEEL_INNER_RADIUS,
};
pub use gesture::{
    GestureEngine, GestureState, InputDecision, ReplayInput, GESTURE_WATCHDOG_MS, VK_MASK_MENU,
};
pub use model::{
    Action, Button, EmoteId, InputEvent, PingAsset, PingId, Point, Trigger, WheelKind,
    DEFAULT_CLICK_EMOTE, DEFAULT_CLICK_PING, DEFAULT_EMOTE_WHEEL, DEFAULT_PING_WHEEL,
    EMOTE_ASSETS, FALLBACK_TEXTURE, PING_ASSETS, TICK_SOUND,
};
pub use settings::{
    is_custom_emote, is_emote, resolve_settings_path, Hotkey, Settings, SettingsError, ToggleMods,
    LEGACY_SETTINGS_DIR_NAME, SETTINGS_FILE_NAME,
};
pub use wheel::{color, texel, Palette, Surface, Texel, Theme, EXTENT, ICON_RADIUS};
