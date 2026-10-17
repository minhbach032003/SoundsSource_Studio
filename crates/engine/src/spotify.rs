//! Spotify Web API: PKCE on loopback, refresh tokens in the macOS Keychain.
use crate::auth::Pkce;
use reqwest::{Method, StatusCode, blocking::Client};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use url::Url;

pub const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
const SCOPES: &str = "playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state streaming";
const API: &str = "https://api.spotify.com/v1/";

struct Tokens {
    access: String,
    refresh: String,
    expires: Instant,
}
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}
#[derive(Serialize)]
pub struct AccountStatus {
    pub configured: bool,
    pub connected: bool,
    pub device_id: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub is_active: bool,
}
#[derive(Serialize)]
pub struct MusicItem {
    pub id: String,
    pub uri: String,
    pub name: String,
    pub artist: String,
    pub artwork: String,
    pub duration_ms: u64,
}
#[derive(Serialize)]
pub struct MusicPage {
    pub items: Vec<MusicItem>,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

pub struct SpotifyWeb {
    client_id: String,
    client: Client,
    tokens: Mutex<Option<Tokens>>,
    restored: AtomicBool,
    logging_in: AtomicBool,
    device: Mutex<Option<String>>,
}
impl SpotifyWeb {
    pub fn new(client_id: &str) -> Self {
        Self {
            client_id: client_id.into(),
            client: Client::new(),
            tokens: Mutex::new(None),
            restored: AtomicBool::new(false),
            logging_in: AtomicBool::new(false),
            device: Mutex::new(None),
        }
    }
    pub fn connected(&self) -> bool {
        self.tokens.lock().unwrap().is_some()
    }
    pub fn account(&self) -> Result<AccountStatus, String> {
        if !self.restored.load(Ordering::Acquire) && !self.client_id.is_empty() {
            let mut tokens = self.tokens.lock().unwrap();
            if !self.restored.load(Ordering::Acquire) {
                if let Some(refresh) = sound_core::spotify::refresh_token(&self.client_id, None)? {
                    *tokens = Some(Tokens {
                        access: String::new(),
                        refresh,
                        expires: Instant::now(),
                    });
                }
                self.restored.store(true, Ordering::Release);
            }
        }
        Ok(AccountStatus {
            configured: !self.client_id.is_empty(),
            connected: self.connected(),
            device_id: self.device.lock().unwrap().clone(),
        })
    }
    pub fn current_access_token(&self) -> Result<String, String> {
        self.access_token(false)
    }
    pub fn login(&self) -> Result<AccountStatus, String> {
        if self.client_id.len() != 32 {
            return Err("Thiếu SPOTIFY_CLIENT_ID. Cấu hình .env rồi build lại app.".into());
        }
        if self.logging_in.swap(true, Ordering::AcqRel) {
            return Err("Đang chờ đăng nhập trên trình duyệt.".into());
        }
        let result = (|| {
            let listener = TcpListener::bind("127.0.0.1:8888").map_err(
                |_| "Cổng 8888 đang được sử dụng. Đóng ứng dụng đang dùng cổng này rồi thử lại.",
            )?;
            listener
                .set_nonblocking(true)
                .map_err(|_| "Không mở được callback đăng nhập.")?;
            let pkce = Pkce::generate_challenge();
            let mut url = Url::parse("https://accounts.spotify.com/authorize").unwrap();
            url.query_pairs_mut().extend_pairs([
                ("client_id", self.client_id.as_str()),
                ("response_type", "code"),
                ("redirect_uri", REDIRECT_URI),
                ("scope", SCOPES),
                ("state", &pkce.state),
                ("code_challenge_method", "S256"),
                ("code_challenge", &pkce.code_challenge),
            ]);
            sound_core::spotify::open_authorization(url.as_str())?;
            let deadline = Instant::now() + Duration::from_secs(180);
            let code = loop {
                if Instant::now() >= deadline {
                    return Err("Hết thời gian đăng nhập Spotify. Bấm Đăng nhập để thử lại.".into());
                }
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                        let mut buffer = [0; 8192];
                        let mut used = 0;
                        let request_deadline = Instant::now() + Duration::from_secs(2);
                        while used < buffer.len() && Instant::now() < request_deadline {
                            match stream.read(&mut buffer[used..]) {
                                Ok(0) | Err(_) => break,
                                Ok(n) => {
                                    used += n;
                                    if buffer[..used].windows(4).any(|s| s == b"\r\n\r\n") {
                                        break;
                                    }
                                }
                            }
                        }
                        let request = String::from_utf8_lossy(&buffer[..used]);
                        let response = callback_code(&request, &pkce.state);
                        let valid = response.is_ok();
                        let message = if valid {
                            "Spotify authorization received. Return to rust-sound to finish connecting."
                        } else {
                            "Invalid or cancelled authorization. Return to rust-sound and retry."
                        };
                        let _ = write!(
                            stream,
                            "HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{message}",
                            if valid { "200 OK" } else { "400 Bad Request" },
                            message.len()
                        );
                        match response {
                            Ok(code) => break code,
                            Err(CallbackError::Denied) => {
                                return Err("Bạn đã hủy cấp quyền Spotify.".into());
                            }
                            Err(CallbackError::Invalid) => continue,
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(50))
                    }
                    Err(_) => return Err("Không nhận được callback Spotify.".into()),
                }
            };
            let token = self.exchange(&[
                ("grant_type", "authorization_code"),
                ("client_id", &self.client_id),
                ("code", &code),
                ("redirect_uri", REDIRECT_URI),
                ("code_verifier", &pkce.code_verifier),
            ])?;
            let refresh = token
                .refresh_token
                .clone()
                .ok_or("Spotify không trả về refresh token. Thử đăng nhập lại.")?;
            let tokens = tokens_from_response(token, refresh)?;
            let mut current = self.tokens.lock().unwrap();
            sound_core::spotify::refresh_token(&self.client_id, Some(Some(&tokens.refresh)))?;
            *current = Some(tokens);
            drop(current);
            self.restored.store(true, Ordering::Release);
            self.account()
        })();
        self.logging_in.store(false, Ordering::Release);
        result
    }
    pub fn logout(&self) -> Result<(), String> {
        if self.logging_in.load(Ordering::Acquire) {
            return Err(
                "Hoàn tất hoặc chờ hết thời gian đăng nhập trước khi ngắt tài khoản.".into(),
            );
        }
        // Hold the token lock so a concurrent refresh cannot recreate a deleted token.
        let mut tokens = self.tokens.lock().unwrap();
        sound_core::spotify::refresh_token(&self.client_id, Some(None))?;
        *tokens = None;
        *self.device.lock().unwrap() = None;
        self.restored.store(true, Ordering::Release);
        Ok(())
    }
    fn exchange(&self, fields: &[(&str, &str)]) -> Result<TokenResponse, String> {
        let response = self
            .client
            .post("https://accounts.spotify.com/api/token")
            .timeout(Duration::from_secs(15))
            .form(fields)
            .send()
            .map_err(|_| "Không kết nối được Spotify. Kiểm tra mạng rồi thử lại.")?;
        if !response.status().is_success() {
            return Err(format!(
                "Spotify từ chối đăng nhập ({}). Kiểm tra Client ID, Redirect URI và quyền tài khoản trong Developer Dashboard.",
                response.status().as_u16()
            ));
        }
        let mut bytes = Vec::new();
        response
            .take(16_385)
            .read_to_end(&mut bytes)
            .map_err(|_| "Không đọc được token Spotify.")?;
        if bytes.len() > 16_384 {
            return Err("Phản hồi token Spotify quá lớn.".into());
        }
        serde_json::from_slice(&bytes).map_err(|_| "Dữ liệu token Spotify không hợp lệ.".into())
    }
    fn access_token(&self, force: bool) -> Result<String, String> {
        let mut tokens = self.tokens.lock().unwrap();
        let current = tokens
            .as_ref()
            .ok_or("Đăng nhập Spotify để dùng thư viện và tìm kiếm.")?;
        if force || current.expires <= Instant::now() {
            let response = self.exchange(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", &current.refresh),
                ("client_id", &self.client_id),
            ])?;
            let refresh = response
                .refresh_token
                .clone()
                .unwrap_or_else(|| current.refresh.clone());
            let next = tokens_from_response(response, refresh)?;
            if next.refresh != current.refresh {
                sound_core::spotify::refresh_token(&self.client_id, Some(Some(&next.refresh)))?;
            }
            *tokens = Some(next);
        }
        Ok(tokens.as_ref().unwrap().access.clone())
    }
    fn request(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, String> {
        // Paths are constructed internally. Never accept a URL supplied by the webview.
        for attempt in 0..2 {
            let token = self.access_token(attempt == 1)?;
            let mut request = self
                .client
                .request(method.clone(), format!("{API}{path}"))
                .timeout(Duration::from_secs(15))
                .bearer_auth(token)
                .query(query);
            if let Some(ref body) = body {
                request = request.json(body);
            }
            let response = request
                .send()
                .map_err(|_| "Không kết nối được Spotify. Kiểm tra mạng rồi thử lại.")?;
            let status = response.status();
            if status == StatusCode::UNAUTHORIZED && attempt == 0 {
                continue;
            }
            if !status.is_success() {
                let retry_after = response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_owned);
                // Spotify nói rõ lý do trong thân phản hồi; đoán hộ nó thì mất luôn manh mối.
                let mut body = Vec::new();
                let _ = response.take(4096).read_to_end(&mut body);
                return Err(api_error(
                    status.as_u16(),
                    &String::from_utf8_lossy(&body),
                    retry_after.as_deref(),
                    path,
                ));
            }
            if status == StatusCode::NO_CONTENT || response.content_length() == Some(0) {
                return Ok(Value::Null);
            }
            let mut bytes = Vec::new();
            response
                .take(2_000_001)
                .read_to_end(&mut bytes)
                .map_err(|_| "Không đọc được phản hồi Spotify.")?;
            if bytes.len() > 2_000_000 {
                return Err("Phản hồi Spotify quá lớn.".into());
            }
            // Playback controls answer 200/202 with an empty body and no Content-Length.
            if bytes.is_empty() { return Ok(Value::Null); }
            return serde_json::from_slice(&bytes)
                .map_err(|_| "Dữ liệu Spotify không hợp lệ.".into());
        }
        unreachable!()
    }
    pub fn devices(&self) -> Result<Vec<Device>, String> {
        let data = self.request(Method::GET, "me/player/devices", &[], None)?;
        let devices: Vec<Device> = data["devices"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|v| v["type"] == "Computer" && v["is_restricted"] != true)
            .filter_map(|v| serde_json::from_value(v.clone()).ok())
            .collect();
        let mut selected = self.device.lock().unwrap();
        if !devices.iter().any(|d| Some(&d.id) == selected.as_ref()) {
            let local_name = std::process::Command::new("/usr/sbin/scutil")
                .args(["--get", "ComputerName"])
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
                .unwrap_or_default();
            *selected = default_device(&devices, &local_name).map(|d| d.id.clone());
        }
        Ok(devices)
    }
    /// Đánh thức một thiết bị Connect. Thiết bị đang nằm chờ vẫn nhận lệnh phát,
    /// nhưng Spotify không gửi nhạc tới cho đến khi phát được chuyển hẳn sang nó.
    fn ensure_active(&self, id: &str) -> Result<(), String> {
        let devices = self.devices()?;
        let Some(device) = devices.iter().find(|d| d.id == id) else {
            return Err("Thiết bị không còn khả dụng. Làm mới danh sách thiết bị.".into());
        };
        if device.is_active {
            return Ok(());
        }
        self.request(
            Method::PUT,
            "me/player",
            &[],
            Some(json!({ "device_ids": [id] })),
        )
        .map(|_| ())
    }
    pub fn select_device(&self, id: &str) -> Result<(), String> {
        if !self.devices()?.iter().any(|d| d.id == id) {
            return Err("Thiết bị không còn khả dụng. Làm mới danh sách thiết bị.".into());
        }
        *self.device.lock().unwrap() = Some(id.into());
        // Chọn thiết bị chỉ là một lựa chọn cục bộ: nó không được hỏng vì Spotify từ
        // chối đánh thức. Lỗi đó thuộc về lúc phát, nơi nó thật sự cản người dùng.
        let _ = self.ensure_active(id);
        Ok(())
    }
    fn device_id(&self) -> Result<String, String> {
        if self.device.lock().unwrap().is_none() {
            self.devices()?;
        }
        self.device
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "Chọn Spotify trên máy Mac này trong danh sách thiết bị phát.".into())
    }
    pub fn browse(
        &self,
        kind: &str,
        query: &str,
        offset: u32,
        playlist_id: Option<&str>,
    ) -> Result<MusicPage, String> {
        let (path, mut parameters, limit) = browse_request(kind, query, offset, playlist_id)?;
        parameters.push(("offset", offset.to_string()));
        parameters.push(("limit", limit.to_string()));
        let data = self.request(Method::GET, &path, &parameters, None)?;
        let page = if kind == "search" {
            &data["tracks"]
        } else {
            &data
        };
        Ok(parse_page(page, offset, limit, kind))
    }
    pub fn play_uri(&self, uri: &str) -> Result<(), String> {
        if !valid_uri(uri) {
            return Err("Invalid Spotify URI".into());
        }
        let body = if uri.starts_with("spotify:track:") {
            json!({"uris":[uri]})
        } else {
            json!({"context_uri":uri})
        };
        let device = self.device_id()?;
        self.ensure_active(&device)?;
        self.request(
            Method::PUT,
            "me/player/play",
            &[("device_id", device)],
            Some(body),
        )
        .map(|_| ())
    }
    pub fn control(&self, action: &str) -> Result<(), String> {
        let (method, path) = match action {
            "play_pause" => {
                let playback = self.playback()?;
                (
                    Method::PUT,
                    if playback.playing {
                        "me/player/pause"
                    } else {
                        "me/player/play"
                    },
                )
            }
            "next" => (Method::POST, "me/player/next"),
            "previous" => (Method::POST, "me/player/previous"),
            _ => return Err("Invalid Spotify action".into()),
        };
        self.request(method, path, &[("device_id", self.device_id()?)], None)
            .map(|_| ())
    }
    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
            return Err("Volume must be between 0 and 1".into());
        }
        self.request(
            Method::PUT,
            "me/player/volume",
            &[
                ("device_id", self.device_id()?),
                ("volume_percent", (volume * 100.0).round().to_string()),
            ],
            None,
        )
        .map(|_| ())
    }
    pub fn playback(&self) -> Result<sound_core::spotify::SpotifyPlayback, String> {
        let data = self.request(Method::GET, "me/player", &[], None)?;
        // Do not display a phone/remote session as the Mac's DSP source.
        let selected = self.device.lock().unwrap().clone();
        if data.is_null() || selected.as_deref() != data["device"]["id"].as_str() {
            return Ok(sound_core::spotify::SpotifyPlayback {
                running: true,
                ..Default::default()
            });
        }
        let item = &data["item"];
        Ok(sound_core::spotify::SpotifyPlayback {
            running: true,
            playing: data["is_playing"].as_bool().unwrap_or(false),
            title: text(item, "name"),
            artist: artists(item),
            album: text(&item["album"], "name"),
            artwork: artwork(&item["album"]),
            position: data["progress_ms"].as_f64().unwrap_or(0.0) / 1000.0,
            duration: item["duration_ms"].as_f64().unwrap_or(0.0) / 1000.0,
        })
    }
}

fn tokens_from_response(response: TokenResponse, refresh: String) -> Result<Tokens, String> {
    if response.access_token.is_empty()
        || refresh.is_empty()
        || response.expires_in == 0
        || response.expires_in > 86400
    {
        return Err("Token Spotify không hợp lệ. Thử đăng nhập lại.".into());
    }
    Ok(Tokens {
        access: response.access_token,
        refresh,
        expires: Instant::now() + Duration::from_secs(response.expires_in.saturating_sub(30)),
    })
}
#[derive(Debug, PartialEq)]
enum CallbackError {
    Invalid,
    Denied,
}
fn callback_code(request: &str, expected_state: &str) -> Result<String, CallbackError> {
    let mut parts = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace();
    if parts.next() != Some("GET") {
        return Err(CallbackError::Invalid);
    }
    let path = parts.next().ok_or(CallbackError::Invalid)?;
    if !path.starts_with("/callback?") || path.len() > 4096 {
        return Err(CallbackError::Invalid);
    }
    let url =
        Url::parse(&format!("http://127.0.0.1:8888{path}")).map_err(|_| CallbackError::Invalid)?;
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(k, _)| k == "state").collect();
    if states.len() != 1 || !bool::from(states[0].1.as_bytes().ct_eq(expected_state.as_bytes())) {
        return Err(CallbackError::Invalid);
    }
    if pairs.iter().any(|(k, _)| k == "error") {
        return Err(CallbackError::Denied);
    }
    let codes: Vec<_> = pairs.iter().filter(|(k, _)| k == "code").collect();
    if codes.len() != 1 || codes[0].1.is_empty() {
        return Err(CallbackError::Invalid);
    }
    Ok(codes[0].1.to_string())
}
fn valid_id(id: &str) -> bool {
    id.len() == 22 && id.bytes().all(|c| c.is_ascii_alphanumeric())
}
fn valid_uri(uri: &str) -> bool {
    let mut parts = uri.split(':');
    parts.next() == Some("spotify")
        && matches!(parts.next(), Some("track" | "album" | "playlist"))
        && parts.next().is_some_and(valid_id)
        && parts.next().is_none()
}
fn browse_request(
    kind: &str,
    query: &str,
    offset: u32,
    playlist_id: Option<&str>,
) -> Result<(String, Vec<(&'static str, String)>, u32), String> {
    if offset > 100_000 {
        return Err("Invalid pagination offset".into());
    }
    let path = match kind {
        "playlists" => "me/playlists".into(),
        "saved" => "me/tracks".into(),
        "playlist" => {
            let id = playlist_id
                .filter(|id| valid_id(id))
                .ok_or("Invalid playlist ID")?;
            format!("playlists/{id}/items")
        }
        "search" => {
            if query.trim().is_empty() || query.len() > 500 || offset > 1000 {
                return Err("Nhập từ khóa tìm kiếm tối đa 500 ký tự.".into());
            }
            return Ok((
                "search".into(),
                vec![("q", query.trim().into()), ("type", "track".into())],
                10,
            ));
        }
        _ => return Err("Invalid Spotify library request".into()),
    };
    Ok((path, vec![], 20))
}
fn text(value: &Value, field: &str) -> String {
    value[field].as_str().unwrap_or_default().into()
}
fn artists(value: &Value) -> String {
    value["artists"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v["name"].as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
fn artwork(value: &Value) -> String {
    value["images"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v["url"].as_str())
        .find(|s| s.starts_with("https://"))
        .unwrap_or_default()
        .into()
}
fn parse_page(page: &Value, offset: u32, limit: u32, kind: &str) -> MusicPage {
    let items = page["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|wrapper| {
            let item = if kind == "saved" || kind == "playlist" {
                wrapper.get("item").or_else(|| wrapper.get("track"))?
            } else {
                wrapper
            };
            let uri = text(item, "uri");
            if !valid_uri(&uri) || item["is_local"] == true || item["is_playable"] == false {
                return None;
            }
            Some(MusicItem {
                id: text(item, "id"),
                uri,
                name: text(item, "name"),
                artist: if kind == "playlists" {
                    text(&item["owner"], "display_name")
                } else {
                    artists(item)
                },
                artwork: artwork(if kind == "playlists" {
                    item
                } else {
                    &item["album"]
                }),
                duration_ms: item["duration_ms"].as_u64().unwrap_or(0),
            })
        })
        .collect();
    // Spotify's next URL is an indicator only; never follow server-supplied URLs with credentials.
    MusicPage {
        items,
        offset,
        next_offset: page["next"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|_| offset + limit),
    }
}

/// rust-sound tự phát nhạc, nên nó là đích mặc định; app Spotify trên máy chỉ là phương án dự phòng.
fn default_device<'a>(devices: &'a [Device], local_name: &str) -> Option<&'a Device> {
    devices
        .iter()
        .find(|d| d.name.eq_ignore_ascii_case(crate::spotify_player::LOCAL_DEVICE_NAME))
        .or_else(|| devices.iter().find(|d| d.name == local_name))
}

/// Dịch một phản hồi lỗi của Spotify, giữ nguyên lời giải thích của chính Spotify.
fn api_error(status: u16, body: &str, retry_after: Option<&str>, path: &str) -> String {
    let base = match status {
        401 => "Phiên Spotify hết hạn. Ngắt tài khoản rồi đăng nhập lại.".to_string(),
        403 => "Spotify không cho phép thao tác này. Kiểm tra Premium, User Management của Developer App; playlist của người khác có thể bị Spotify giới hạn.".to_string(),
        404 => "Không thấy thiết bị Spotify sẵn sàng. Mở Spotify trên Mac, chọn thiết bị phát rồi thử lại.".to_string(),
        429 => format!(
            "Spotify giới hạn số yêu cầu. Thử lại sau {} giây.",
            retry_after.unwrap_or("30")
        ),
        _ => format!("Spotify gặp lỗi ({status}). Thử lại sau."),
    };
    // Lệnh nào bị từ chối là thông tin đầu tiên cần có khi đi tìm nguyên nhân.
    let base = format!("{base} [{path}]");
    let Ok(parsed) = serde_json::from_str::<Value>(body) else {
        return base;
    };
    let field = |key: &str| {
        parsed["error"][key]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    let detail = match (field("message"), field("reason")) {
        (Some(message), Some(reason)) if message != reason => format!("{message} ({reason})"),
        (Some(message), _) => message,
        (None, Some(reason)) => reason,
        (None, None) => return base,
    };
    format!("{base} Spotify nói: {detail}")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oauth_callback_and_library_boundaries() {
        assert_eq!(
            callback_code(
                "GET /callback?code=hello%2Bworld&state=nonce HTTP/1.1\r\n\r\n",
                "nonce"
            ),
            Ok("hello+world".into())
        );
        for request in [
            "GET /callback?code=x&state=wrong HTTP/1.1",
            "GET /callback?code=x HTTP/1.1",
            "POST /callback?code=x&state=nonce HTTP/1.1",
            "GET /callback?code=x&state=nonce&state=nonce HTTP/1.1",
            "GET /other?code=x&state=nonce HTTP/1.1",
        ] {
            assert_eq!(callback_code(request, "nonce"), Err(CallbackError::Invalid));
        }
        assert_eq!(
            callback_code(
                "GET /callback?error=access_denied&state=nonce HTTP/1.1",
                "nonce"
            ),
            Err(CallbackError::Denied)
        );
        assert!(!valid_uri("spotify:track:../../me"));
        assert!(!valid_uri("https://evil.example/track/123"));
        assert!(!valid_uri("spotify:track:6rqhFgbbKwnb9MLmUQDhG6:extra"));
        assert!(valid_uri("spotify:track:6rqhFgbbKwnb9MLmUQDhG6"));
        assert!(browse_request("playlist", "", 0, Some("../../me")).is_err());
        assert!(browse_request("search", "", 0, None).is_err());
        let request = browse_request("search", "âm nhạc", 10, None).unwrap();
        assert_eq!(request.2, 10);
        assert_eq!(request.1[0].1, "âm nhạc");
        assert_eq!(
            browse_request("playlist", "", 0, Some("6rqhFgbbKwnb9MLmUQDhG6"))
                .unwrap()
                .0,
            "playlists/6rqhFgbbKwnb9MLmUQDhG6/items"
        );
        let track = json!({"id":"6rqhFgbbKwnb9MLmUQDhG6", "uri":"spotify:track:6rqhFgbbKwnb9MLmUQDhG6", "name":"Test", "artists":[{"name":"Artist"}], "album":{"images":[{"url":"https://example.com/art.jpg"}]}, "duration_ms":123000});
        for key in ["item", "track"] {
            let mut wrapper = json!({});
            wrapper[key] = track.clone();
            let page = parse_page(
                &json!({"items":[wrapper,{"item":null}],"next":"https://api.spotify.com/next"}),
                0,
                20,
                "playlist",
            );
            assert_eq!(page.items.len(), 1);
            assert_eq!(page.items[0].artist, "Artist");
            assert_eq!(page.next_offset, Some(20));
        }
        let device = |id: &str, name: &str| Device {
            id: id.into(),
            name: name.into(),
            is_active: false,
        };
        let both = [device("mac", "mac's Mac mini"), device("rs", "rust-sound")];
        assert_eq!(
            default_device(&both, "mac's Mac mini").map(|d| d.id.as_str()),
            Some("rs"),
            "có rust-sound thì phát trong app, không đẩy sang app Spotify"
        );
        assert_eq!(
            default_device(&both[..1], "mac's Mac mini").map(|d| d.id.as_str()),
            Some("mac"),
            "chưa có rust-sound thì mới dùng máy này"
        );
        assert!(default_device(&both[..1], "máy khác").is_none());
        assert!(
            api_error(
                403,
                r#"{"error":{"status":403,"message":"Player command failed: Restriction violated","reason":"UNKNOWN"}}"#,
                None,
                "me/player",
            )
            .ends_with("Spotify nói: Player command failed: Restriction violated (UNKNOWN)"),
            "lý do Spotify đưa ra phải tới được người dùng"
        );
        let refused = api_error(403, "", None, "me/player/play");
        assert!(
            refused.ends_with("[me/player/play]"),
            "phải nói rõ lệnh nào bị từ chối, nếu không thì không lần ra được: {refused}"
        );
        assert!(api_error(429, "not json", Some("12"), "me/player").contains("sau 12 giây"));
        assert!(
            tokens_from_response(
                TokenResponse {
                    access_token: "a".into(),
                    refresh_token: None,
                    expires_in: u64::MAX
                },
                "r".into()
            )
            .is_err()
        );
    }
}
