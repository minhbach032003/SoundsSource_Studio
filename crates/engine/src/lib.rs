pub use sound_core::device;
pub use sound_dsp::{eq, filter, pcm_queue, preset, spectrum};
pub use sound_auth as auth;
pub use sound_pet as pet;
pub use sound_calendar as google_calendar;
pub use google_calendar as calendar;
pub mod router;
pub mod spotify;
pub mod spotify_player;
pub mod timer;
pub mod wheel;

pub use auth::{
    AuthRepository, AuthService, AuthSession, AuthenticatedUser, DualAuthError,
    DualAuthValidator, GoogleAuthError, GoogleAuthVerifier, GoogleUserProfile,
    JwtClaims, JwtError, JwtManager, KeycloakClaims, KeycloakError, KeycloakVerifier,
    Pkce, PkceChallenge, PkceError, User, UserIdentity, NEON_MIGRATIONS_DDL,
};
pub use device::AudioDevice;
pub use eq::{EQBandConfig, ParametricEQ, DEFAULT_EQ_FREQUENCIES};
pub use filter::{
    AudioFilterEngine, AudioFilterSettings, FilterProcessingStats, MicFilterConfig,
    OutputFilterConfig,
};
pub use google_calendar::{
    parse_calendar_events_json, today_time_window, today_time_window_from,
    GoogleCalendarAccount, GoogleCalendarEventDto, GoogleCalendarService,
    GoogleCalendarStatus, KeychainTokenStorage, MockTokenStorage, StoredTokens,
    TokenStorage, CALENDAR_SCOPES, GOOGLE_AUTH_URL, GOOGLE_CALENDAR_EVENTS_URL,
    GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL,
};
pub use pet::{
    ActivityFormatter, ActivityTheme, AgentEvent, AgentIntegrationInfo, AgentKind, AgentPetServer,
    AgentSession, AgentState, BreakClock, BreakClockConfig, BreakTickResult, HookManager,
    ModelPricing, PetCareState, PetCareStore, PetHunger, PetManager, PetMood, QuestionDetector,
    SessionStore, TranscriptReader, UsageDelta, MEAL_XP, TOKENS_PER_XP,
};
pub use preset::{AppAudioSettings, Preset, PresetStore};
pub use router::{AppAudioChannel, AudioRouter, ChannelStateDto};
pub use timer::{BreakTimerManager, TimerPhase, TimerStatus, TodoItem};
pub use wheel::{
    display_at_physical, physical_to_dip, pick_slice, select_slot, select_slot_scaled, Action,
    Button, CatalogEntry, DisplayMap, GestureEngine, GestureResult, GestureState, Hotkey,
    InputDecision, InputEvent, PingAsset, PingId, PingloomSettings, Point, ReplayInput, Settings,
    SettingsError, ToggleMods, Trigger, WheelKind, DIRECTIONS, DIRECTION_LABELS,
    WHEEL_INNER_RADIUS,
};
