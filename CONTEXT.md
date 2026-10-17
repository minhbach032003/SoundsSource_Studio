# Rust Sound UI & Audio Context

The frontend and tactical audio/visual desktop companion system powering rust-sound.

## Language

### Surfaces & Styling

**Panel**:
A compound visual container rendered with pingloom's unified bezel and plate styling via named CSS.
_Avoid_: Card, container, box

**Bezel**:
The outer metallic frame with spotlight gradients surrounding every primary panel.
_Avoid_: Border, frame

**Plate**:
The inner surface of a panel holding content and controls.
_Avoid_: Content-area, card-body

**Atmosphere**:
The background ambient glow and soft aurora lighting layer beneath windows and surfaces.
_Avoid_: Wallpaper background, backdrop tint

### Spotify Audio

**Spotify Local Player**:
rust-sound tự là nguồn nhạc Spotify: phát không cần app Spotify trên máy. Loại trừ với Spotify DSP Connection — mỗi lúc chỉ một nguồn.
_Avoid_: tap, remote device

**Spotify Playback Sign-In**:
A sign-in of its own, separate from the Spotify Library Connection, that authorizes rust-sound to play music itself. Spotify grants playback only to its official desktop client identity, so the library sign-in cannot carry it. Asked for once; stored apart from the library credential, and cleared together with it on sign-out.
_Avoid_: second account, logging in twice to the same thing

**Spotify Integration**:
The in-app controls and now-playing information for Spotify, supporting both local playback inside rust-sound and external background Spotify on this Mac as the music source.

**Spotify Workspace**:
The dedicated area for Spotify-only bass / EQ and browsing playlists, liked tracks and search results. Approved layout B places a full-width EQ workspace above the library: curve and faders on the left, presets and spectrum on the right, with the Now-Playing Bar always available below. Narrow windows use a collapsed EQ disclosure above the library. Opening this area does not start playback or change the DSP connection.
_Avoid_: Mixer playlist panel

**Now-Playing Bar**:
Persistent Spotify track information, transport, progress and volume controls available while moving between application areas. It controls the active Spotify source (either rust-sound's local player or background Spotify).
_Avoid_: Global system volume

**Mixer**:
The area for application channels and hardware audio controls, separate from music-library browsing.
_Avoid_: Spotify library, music player

**Spotify Library Connection**:
Spotify Web API authorization used to browse personal playlists, liked tracks and search results, and send playback commands to a selected computer. Uses PKCE with the system browser and a loopback callback; refresh tokens stay in macOS Keychain. It is independent of the Spotify DSP Connection and macOS Automation permission. Spotify Development Mode may restrict other users' playlist contents.
_Avoid_: Spotify password, Client Secret in the desktop app, authenticated means DSP active

**Spotify DSP Connection**:
The active audio path that applies rust-sound's bass and EQ to Spotify alone. Playback controls and an EQ curve on screen do not by themselves mean this connection is active.
_Avoid_: Mapping music, DSP active without audio

**Spotify Spectrum**:
The frequency-energy display of Spotify's actual audio, distinct from the EQ response curve and from whether Spotify reports playback. Other applications' audio is excluded.
_Avoid_: EQ animation, simulated beat meter, system-wide spectrum

### Pingloom Subsystem & Tactical Gestures

**Subsystem (Pingloom)**:
The complete integrated in-game and desktop tactical radial HUD, gesture recognizer, audio effects, and emote companion system inside rust-sound.

**Wheel (Radial HUD)**:
An 8-slice radial visual indicator (Ping Wheel or Emote Wheel) appearing at the gesture origin, providing direction-based selection and deadzone cancel.

**Activation Key**:
The primary modifier or key (e.g. `Option` / Alt for Pings, `Control` for Emotes) held down to prime a gesture.

**Drag Gesture**:
Holding the activation key and dragging the left mouse button past the configured deadzone threshold (default 8px) to open the wheel and select a slice.

**Deadzone**:
The inner radius (default ~43px / threshold 8px) where releasing the pointer or trigger cancels the gesture without placing an item.


**Ping**:
A short-lived visual marker with an associated sound that expresses an intent such as danger, warning, or assist.
_Avoid_: Notification, alert, message

**Emote**:
A short-lived expressive image or animated sticker (WebP/GIF) with optional sound effect.
_Avoid_: Ping, sticker, badge

**Wheel**:
An eight-slice radial selection HUD for pings or emotes, containing a central deadzone cancellation circle.
_Avoid_: Menu, wheel menu, popup picker

**Trigger**:
The specific modifier/key held to initiate a radial wheel gesture (e.g. `Option` for Ping Wheel, `Ctrl` for Emote Wheel).
_Avoid_: Shortcut, hotkey

**Gesture**:
A trigger-held pointer drag across the desktop that selects one of eight radial slices or cancels within the deadzone.
_Avoid_: Mouse click, drag-drop

**Deadzone**:
The central circular threshold area of a wheel where releasing the trigger cancels the gesture without placing an item.
_Avoid_: Safe zone, center button

**Toggle Shortcut**:
The global key combination that pauses or resumes desktop gestures entirely.
_Avoid_: Trigger, mute shortcut

**Pause**:
A state in which ordinary desktop input passes through unhindered and no wheel gesture can be initiated.
_Avoid_: Disabled, sleep

**AgentPet**:
An interactive pixel/vector desktop companion with focus level progression, token burning, and sound interactions.
_Avoid_: Avatar widget, mascot

**Break Scrim**:
The full-screen lock overlay enforcing scheduled rest intervals during deep work sessions.
_Avoid_: Screen shield, lockscreen overlay

### Voice AI

**Reply Delay**:
How long the user must stay silent before Gemini is allowed to answer. Lower means it answers sooner but may cut in while the user is still thinking mid-sentence; the user chooses it. Distinct from how long Gemini takes to answer once it has started, which nobody here controls.
_Avoid_: response time (means both and neither), latency, speed

**Uplink Priority**:
Speech outranks vision on the one socket both travel. A screen frame is skipped rather than queued ahead of the words the user is saying, and a fresh frame is sent the moment they stop speaking.
_Avoid_: frame rate, dropping frames
