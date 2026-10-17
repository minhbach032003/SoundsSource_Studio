use std::sync::{Arc, Mutex};
use librespot_connect::{ConnectConfig, Spirc};
use librespot_core::authentication::Credentials;
use librespot_core::config::{DeviceType, SessionConfig};
use librespot_core::session::Session;
use librespot_playback::audio_backend::Sink;
use librespot_playback::config::{Bitrate, PlayerConfig};
use librespot_playback::mixer::softmixer::SoftMixer;
use librespot_playback::mixer::{Mixer, MixerConfig};
use librespot_playback::player::Player;
use serde::Serialize;
use tokio::runtime::Runtime;

#[derive(Clone, Default, Serialize)]
pub struct LocalPlayerState {
    pub running: bool,
    pub playing: bool,
    pub error: Option<String>,
}

pub struct LocalPlayer {
    state: Arc<Mutex<LocalPlayerState>>,
    runtime: Mutex<Option<Runtime>>,
    spirc: Mutex<Option<Arc<Spirc>>>,
}

impl Default for LocalPlayer {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalPlayer {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(LocalPlayerState::default())),
            runtime: Mutex::new(None),
            spirc: Mutex::new(None),
        }
    }

    pub fn state(&self) -> LocalPlayerState {
        self.state.lock().unwrap().clone()
    }

    pub fn stop(&self) {
        if let Some(spirc) = self.spirc.lock().unwrap().take() {
            let _ = spirc.shutdown();
        }
        if let Some(rt) = self.runtime.lock().unwrap().take() {
            rt.shutdown_background();
        }
        let mut st = self.state.lock().unwrap();
        st.running = false;
        st.playing = false;
    }

    pub fn start(
        &self,
        access_token: &str,
        sink_builder: Box<dyn FnOnce() -> Box<dyn Sink> + Send + 'static>,
    ) -> Result<(), String> {
        let token = access_token.trim();
        if token.is_empty() {
            let err = "Vui lòng đăng nhập Spotify trước khi phát nhạc.".to_string();
            self.state.lock().unwrap().error = Some(err.clone());
            return Err(err);
        }

        // Dừng session cũ nếu đang chạy
        self.stop();

        let state = self.state.clone();
        let rt = Runtime::new().map_err(|e| format!("Không khởi tạo được runtime Tokio: {e}"))?;

        let token = token.to_string();
        let (spirc_tx, spirc_rx) = std::sync::mpsc::channel();

        rt.spawn(async move {
            let session = Session::new(SessionConfig::default(), None);
            let credentials = Credentials::with_access_token(token);

            if let Err(e) = session.connect(credentials.clone(), false).await {
                let err_msg = format!("Lỗi kết nối Spotify: {e:?}");
                let mut st = state.lock().unwrap();
                st.running = false;
                st.playing = false;
                st.error = Some(err_msg.clone());
                let _ = spirc_tx.send(Err(err_msg));
                return;
            }

            let mixer = match SoftMixer::open(MixerConfig::default()) {
                Ok(m) => Arc::new(m),
                Err(e) => {
                    let err_msg = format!("Lỗi khởi tạo mixer: {e:?}");
                    let mut st = state.lock().unwrap();
                    st.running = false;
                    st.error = Some(err_msg.clone());
                    let _ = spirc_tx.send(Err(err_msg));
                    return;
                }
            };
            let volume_getter = mixer.get_soft_volume();

            let mut player_config = PlayerConfig::default();
            player_config.bitrate = Bitrate::Bitrate320;

            let player = Player::new(
                player_config,
                session.clone(),
                volume_getter,
                sink_builder,
            );

            let mut connect_config = ConnectConfig::default();
            connect_config.name = "rust-sound".to_string();
            connect_config.device_type = DeviceType::Computer;

            match Spirc::new(connect_config, session, credentials, player, mixer).await {
                Ok((spirc, spirc_task)) => {
                    let spirc = Arc::new(spirc);
                    let _ = spirc_tx.send(Ok(spirc));
                    {
                        let mut st = state.lock().unwrap();
                        st.running = true;
                        st.error = None;
                    }
                    spirc_task.await;
                    let mut st = state.lock().unwrap();
                    st.running = false;
                    st.playing = false;
                }
                Err(e) => {
                    let err_msg = format!("Lỗi khởi động Spotify Connect: {e:?}");
                    let mut st = state.lock().unwrap();
                    st.running = false;
                    st.playing = false;
                    st.error = Some(err_msg.clone());
                    let _ = spirc_tx.send(Err(err_msg));
                }
            }
        });

        match spirc_rx.recv() {
            Ok(Ok(spirc)) => {
                *self.spirc.lock().unwrap() = Some(spirc);
                *self.runtime.lock().unwrap() = Some(rt);
                Ok(())
            }
            Ok(Err(err)) => {
                rt.shutdown_background();
                Err(err)
            }
            Err(_) => {
                rt.shutdown_background();
                let err = "Không nhận được phản hồi khởi động từ Spotify session.".to_string();
                self.state.lock().unwrap().error = Some(err.clone());
                Err(err)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_player_that_never_started_is_not_running() {
        let player = LocalPlayer::new();
        let state = player.state();
        assert!(!state.running && !state.playing && state.error.is_none());
        player.stop(); // stop khi chưa start không được panic
        assert!(!player.state().running);
    }

    #[test]
    fn an_empty_token_fails_before_touching_the_network() {
        let player = LocalPlayer::new();
        let error = player
            .start("", Box::new(|| unreachable!("không được dựng sink khi token rỗng")))
            .unwrap_err();
        assert!(
            error.contains("đăng nhập"),
            "lỗi phải là tiếng Việt, nhận được: {error}"
        );
    }

    #[test]
    fn an_expired_token_surfaces_a_vietnamese_error() {
        let player = LocalPlayer::new();
        let error = player
            .start(
                "invalid_or_expired_token",
                Box::new(|| unreachable!("không được dựng sink")),
            )
            .unwrap_err();
        assert!(
            error.contains("Spotify"),
            "lỗi phải là tiếng Việt, nhận được: {error}"
        );
        assert!(!player.state().running);
    }
}
