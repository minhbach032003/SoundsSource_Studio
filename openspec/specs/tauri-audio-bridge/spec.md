# tauri-audio-bridge Specification

## Purpose
TBD - created by archiving change setup-tauri-project-structure. Update Purpose after archive.
## Requirements
### Requirement: Tauri Commands for CoreAudio
The Rust backend SHALL expose Tauri IPC commands to inspect audio processes and devices, adjust volume/mute, configure EQ, and manage presets.

#### Scenario: List active audio processes
- **WHEN** the frontend invokes `get_audio_processes`
- **THEN** the backend returns an array of active audio processes discovered via CoreAudio.

#### Scenario: Adjust app volume and mute
- **WHEN** the frontend invokes `set_app_volume` or `set_app_mute` with a specific bundle identifier
- **THEN** the audio router applies the volume multiplier and mute state to the designated channel.

