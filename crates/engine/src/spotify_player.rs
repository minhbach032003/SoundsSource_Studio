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
use librespot_oauth::OAuthClientBuilder;
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

            // Spirc::new tự gọi session.connect sau khi đăng ký listener. Connect trước
            // ở đây làm Spirc hỏng với Unavailable/NotConnected.
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


/// Spotify Connect chỉ chấp nhận token của client desktop chính thức: token phát cho
/// Client ID riêng của app bị từ chối ở bước client_token/login5 (INVALID_CREDENTIALS).
/// Nên phần phát nhạc có danh tính riêng, lưu tách khỏi token của thư viện.
pub const PLAYBACK_ACCOUNT: &str = "rust-sound-playback";
const PLAYBACK_REDIRECT_URI: &str = "http://127.0.0.1:5588/login";

fn playback_oauth_client() -> Result<librespot_oauth::OAuthClient, String> {
    let client_id = SessionConfig::default().client_id;
    OAuthClientBuilder::new(&client_id, PLAYBACK_REDIRECT_URI, vec!["streaming"])
        .open_in_browser()
        .build()
        .map_err(|e| format!("Không mở được đăng nhập phát nhạc: {e}"))
}

fn stored_playback_token() -> Result<Option<String>, String> {
    sound_core::spotify::refresh_token(PLAYBACK_ACCOUNT, None)
}

/// Đã đăng nhập phần phát nhạc chưa (khác với đăng nhập thư viện).
pub fn playback_connected() -> bool {
    matches!(stored_playback_token(), Ok(Some(token)) if !token.is_empty())
}

/// Mở trình duyệt cho người dùng đồng ý, rồi lưu refresh token vào Keychain.
/// Chặn tới khi xong, nên gọi từ thread nền.
pub fn playback_login() -> Result<(), String> {
    let token = playback_oauth_client()?
        .get_access_token()
        .map_err(|e| format!("Đăng nhập phát nhạc thất bại: {e}"))?;
    if token.refresh_token.is_empty() {
        return Err("Spotify không trả refresh token cho phần phát nhạc.".into());
    }
    sound_core::spotify::refresh_token(PLAYBACK_ACCOUNT, Some(Some(&token.refresh_token)))?;
    Ok(())
}

pub fn playback_logout() -> Result<(), String> {
    sound_core::spotify::refresh_token(PLAYBACK_ACCOUNT, Some(None))?;
    Ok(())
}

/// Chưa đăng nhập phần phát nhạc thì nói rõ phải bấm nút nào, không trả lỗi kỹ thuật.
fn require_playback_refresh(stored: Option<String>) -> Result<String, String> {
    match stored {
        Some(token) if !token.trim().is_empty() => Ok(token),
        _ => Err("Chưa đăng nhập phần phát nhạc. Bấm \"Đăng nhập để phát trong app\" rồi thử lại.".into()),
    }
}

/// Access token để dựng session. Không mở trình duyệt: chưa đăng nhập thì báo lỗi.
pub fn playback_access_token() -> Result<String, String> {
    let refresh = require_playback_refresh(stored_playback_token()?)?;
    let token = playback_oauth_client()?
        .refresh_token(&refresh)
        .map_err(|e| format!("Phiên phát nhạc đã hết hạn, đăng nhập lại giúp tôi: {e}"))?;
    if token.refresh_token != refresh && !token.refresh_token.is_empty() {
        sound_core::spotify::refresh_token(PLAYBACK_ACCOUNT, Some(Some(&token.refresh_token)))?;
    }
    Ok(token.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_playback_login_names_the_button_to_press() {
        for stored in [None, Some(String::new()), Some("   ".to_string())] {
            let error = require_playback_refresh(stored).unwrap_err();
            assert!(
                error.contains("Đăng nhập để phát trong app"),
                "lỗi phải chỉ đúng nút cần bấm, nhận được: {error}"
            );
        }
        assert_eq!(require_playback_refresh(Some("r".into())).unwrap(), "r");
    }

    #[test]
    fn the_playback_identity_is_stored_apart_from_the_library_identity() {
        // Token thư viện lưu theo Client ID của app; token phát nhạc phải khác chỗ,
        // nếu không đăng xuất cái này sẽ xoá nhầm cái kia.
        assert_eq!(PLAYBACK_ACCOUNT, "rust-sound-playback");
        assert!(
            !(PLAYBACK_ACCOUNT.len() == 32 && PLAYBACK_ACCOUNT.bytes().all(|b| b.is_ascii_hexdigit())),
            "không được trùng dạng Client ID mà token thư viện dùng làm khoá Keychain"
        );
    }

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
