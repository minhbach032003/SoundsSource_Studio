pub use sound_core::device;
pub mod auth;
pub mod eq;
pub mod filter;
pub mod pet;
pub mod preset;
pub mod router;
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
pub use pet::{
    AgentEvent, AgentIntegrationInfo, AgentKind, AgentPetServer, AgentSession, AgentState,
    HookManager, PetCareState, PetCareStore, PetHunger, PetManager, PetMood, SessionStore,
    MEAL_XP, TOKENS_PER_XP,
};
pub use preset::{AppAudioSettings, Preset, PresetStore};
pub use router::{AppAudioChannel, AudioRouter, ChannelStateDto};
pub use timer::{BreakTimerManager, TimerPhase, TimerStatus, TodoItem};
pub use wheel::{pick_slice, select_slot, CatalogEntry, GestureResult, PingloomSettings, DIRECTIONS, DIRECTION_LABELS};
