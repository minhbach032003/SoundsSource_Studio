//! Google Calendar Integration: OAuth2 PKCE, token refresh & Keychain storage, and today's events sync.
use sound_auth::{bind_listener, wait_for_code, GoogleAuthVerifier, Pkce};
use chrono::{DateTime, Local, LocalResult, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use url::Url;

pub const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const GOOGLE_CALENDAR_EVENTS_URL: &str =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";
pub const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
pub const CALENDAR_SCOPES: &str =
    "https://www.googleapis.com/auth/calendar.events openid email profile";

/// Google Calendar connection status / account summary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoogleCalendarAccount {
    pub connected: bool,
    pub email: Option<String>,
}

pub type GoogleCalendarStatus = GoogleCalendarAccount;

/// Normalized Google Calendar event DTO for TimerView.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoogleCalendarEventDto {
    pub id: String,
    pub summary: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_minutes: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hangout_link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

/// Payload for creating a new Google Calendar event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateCalendarEventDto {
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

/// Token payload stored securely in macOS Keychain or secure fallback.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64, // Unix timestamp in seconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

impl StoredTokens {
    pub fn is_expired(&self, threshold_seconds: i64) -> bool {
        let now = Utc::now().timestamp();
        self.expires_at - now <= threshold_seconds
    }
}

/// Pluggable storage abstraction for OAuth tokens (Keychain, File, Mock).
pub trait TokenStorage: Send + Sync {
    fn load(&self) -> Result<Option<StoredTokens>, String>;
    fn save(&self, tokens: &StoredTokens) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

/// Keychain-backed token storage with local file fallback.
pub struct KeychainTokenStorage {
    account_key: String,
    fallback_path: PathBuf,
}

impl KeychainTokenStorage {
    pub fn new(account_key: impl Into<String>) -> Self {
        let account_key = account_key.into();
        let fallback_path = get_storage_fallback_path(&account_key);
        Self {
            account_key,
            fallback_path,
        }
    }
}

impl Default for KeychainTokenStorage {
    fn default() -> Self {
        Self::new("rust-sound-google-calendar")
    }
}

fn get_storage_fallback_path(key: &str) -> PathBuf {
    let sanitized: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".rust-sound")
            .join(format!("{sanitized}.json"))
    } else if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata)
            .join("rust-sound")
            .join(format!("{sanitized}.json"))
    } else {
        PathBuf::from(format!(".{sanitized}.json"))
    }
}

impl TokenStorage for KeychainTokenStorage {
    fn load(&self) -> Result<Option<StoredTokens>, String> {
        #[cfg(target_os = "macos")]
        {
            if let Ok(Some(json_str)) = sound_core::spotify::refresh_token(&self.account_key, None)
            {
                if let Ok(tokens) = serde_json::from_str::<StoredTokens>(&json_str) {
                    return Ok(Some(tokens));
                }
            }
        }

        if self.fallback_path.exists() {
            if let Ok(data) = std::fs::read_to_string(&self.fallback_path) {
                if let Ok(tokens) = serde_json::from_str::<StoredTokens>(&data) {
                    return Ok(Some(tokens));
                }
            }
        }
        Ok(None)
    }

    fn save(&self, tokens: &StoredTokens) -> Result<(), String> {
        let json_str = serde_json::to_string(tokens)
            .map_err(|e| format!("Lỗi tuần tự hóa token: {e}"))?;

        let mut saved = false;
        #[cfg(target_os = "macos")]
        {
            if sound_core::spotify::refresh_token(&self.account_key, Some(Some(&json_str))).is_ok()
            {
                saved = true;
            }
        }

        if let Some(parent) = self.fallback_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::write(&self.fallback_path, &json_str).is_ok() {
            saved = true;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(
                    &self.fallback_path,
                    std::fs::Permissions::from_mode(0o600),
                );
            }
        }

        if saved {
            Ok(())
        } else {
            Err("Không lưu được token xác thực Google Calendar.".into())
        }
    }

    fn delete(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let _ = sound_core::spotify::refresh_token(&self.account_key, Some(None));
        }
        if self.fallback_path.exists() {
            let _ = std::fs::remove_file(&self.fallback_path);
        }
        Ok(())
    }
}

/// In-memory mock token storage for tests.
#[derive(Default, Clone)]
pub struct MockTokenStorage {
    tokens: Arc<Mutex<Option<StoredTokens>>>,
}

impl MockTokenStorage {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_tokens(tokens: StoredTokens) -> Self {
        Self {
            tokens: Arc::new(Mutex::new(Some(tokens))),
        }
    }
}

impl TokenStorage for MockTokenStorage {
    fn load(&self) -> Result<Option<StoredTokens>, String> {
        Ok(self.tokens.lock().unwrap().clone())
    }

    fn save(&self, tokens: &StoredTokens) -> Result<(), String> {
        *self.tokens.lock().unwrap() = Some(tokens.clone());
        Ok(())
    }

    fn delete(&self) -> Result<(), String> {
        *self.tokens.lock().unwrap() = None;
        Ok(())
    }
}

fn load_dotenv_var(key: &str) -> Option<String> {
    let candidates = [
        PathBuf::from(".env"),
        PathBuf::from("../../.env"),
        PathBuf::from("../.env"),
    ];
    for path in &candidates {
        if let Ok(content) = std::fs::read_to_string(path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || trimmed.is_empty() {
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once('=') {
                    if k.trim() == key {
                        let val = v.trim().trim_matches(['\"', '\'']);
                        if !val.is_empty() {
                            return Some(val.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

/// Service managing Google Calendar OAuth2 PKCE login, auto refresh, and event fetching.
pub struct GoogleCalendarService {
    client_id: Option<String>,
    client_secret: Option<String>,
    storage: Arc<dyn TokenStorage>,
    client: reqwest::blocking::Client,
    logging_in: AtomicBool,
    active_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

impl Default for GoogleCalendarService {
    fn default() -> Self {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .ok()
            .or_else(|| option_env!("GOOGLE_CLIENT_ID").map(String::from))
            .or_else(|| load_dotenv_var("GOOGLE_CLIENT_ID"))
            .filter(|s| !s.trim().is_empty());
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .ok()
            .or_else(|| option_env!("GOOGLE_CLIENT_SECRET").map(String::from))
            .or_else(|| load_dotenv_var("GOOGLE_CLIENT_SECRET"))
            .filter(|s| !s.trim().is_empty());
        Self::new(client_id, client_secret)
    }
}

impl GoogleCalendarService {
    pub fn new(client_id: Option<String>, client_secret: Option<String>) -> Self {
        Self::with_storage(
            client_id,
            client_secret,
            Arc::new(KeychainTokenStorage::default()),
        )
    }

    pub fn with_storage(
        client_id: Option<String>,
        client_secret: Option<String>,
        storage: Arc<dyn TokenStorage>,
    ) -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();
        Self {
            client_id,
            client_secret,
            storage,
            client,
            logging_in: AtomicBool::new(false),
            active_cancel: Mutex::new(None),
        }
    }

    pub fn status(&self) -> GoogleCalendarAccount {
        match self.storage.load() {
            Ok(Some(tokens)) if !tokens.refresh_token.is_empty() => GoogleCalendarAccount {
                connected: true,
                email: tokens.email,
            },
            _ => GoogleCalendarAccount {
                connected: false,
                email: None,
            },
        }
    }

    pub fn cancel(&self) {
        if let Ok(guard) = self.active_cancel.lock() {
            if let Some(flag) = guard.as_ref() {
                flag.store(true, Ordering::Release);
            }
        }
        self.logging_in.store(false, Ordering::Release);
    }

    pub fn login(&self) -> Result<GoogleCalendarAccount, String> {
        let client_id = self
            .client_id
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                "Chưa cấu hình GOOGLE_CLIENT_ID. Vui lòng thiết lập biến môi trường GOOGLE_CLIENT_ID hoặc cấu hình .env.".to_string()
            })?;

        if self.logging_in.swap(true, Ordering::AcqRel) {
            return Err("Đang chờ đăng nhập Google trên trình duyệt.".into());
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut active) = self.active_cancel.lock() {
            *active = Some(cancel_flag.clone());
        }

        struct LoginGuard<'a>(&'a AtomicBool, &'a Mutex<Option<Arc<AtomicBool>>>);
        impl Drop for LoginGuard<'_> {
            fn drop(&mut self) {
                self.0.store(false, Ordering::Release);
                if let Ok(mut active) = self.1.lock() {
                    *active = None;
                }
            }
        }
        let _guard = LoginGuard(&self.logging_in, &self.active_cancel);

        if cancel_flag.load(Ordering::Acquire) {
            return Err("Đã hủy đăng nhập Google.".into());
        }

        let pkce = Pkce::generate_challenge();
        let (listener, redirect_uri) = bind_listener()?;

        let mut auth_url =
            Url::parse(GOOGLE_AUTH_URL).map_err(|e| format!("URL không hợp lệ: {e}"))?;
        auth_url.query_pairs_mut().extend_pairs([
            ("client_id", client_id),
            ("redirect_uri", &redirect_uri),
            ("response_type", "code"),
            ("scope", CALENDAR_SCOPES),
            ("code_challenge", &pkce.code_challenge),
            ("code_challenge_method", "S256"),
            ("state", &pkce.state),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ]);

        #[cfg(target_os = "macos")]
        let opened = std::process::Command::new("/usr/bin/open")
            .arg(auth_url.as_str())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        #[cfg(not(target_os = "macos"))]
        let opened = false;

        if !opened {
            return Err("Không mở được trình duyệt để xác thực Google.".into());
        }

        let code = wait_for_code(&listener, &pkce.state, &cancel_flag, Duration::from_secs(180))?;
        drop(listener);

        if cancel_flag.load(Ordering::Acquire) {
            return Err("Đã hủy đăng nhập Google.".into());
        }

        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", client_id),
            ("code_verifier", pkce.code_verifier.as_str()),
        ];
        if let Some(ref secret) = self.client_secret {
            form.push(("client_secret", secret.as_str()));
        }

        let resp = self
            .client
            .post(GOOGLE_TOKEN_URL)
            .form(&form)
            .send()
            .map_err(|e| format!("Không thể kết nối đến máy chủ xác thực Google: {e}"))?;

        if !resp.status().is_success() {
            let error_text = resp.text().unwrap_or_default();
            return Err(format!("Xác thực Google thất bại: {error_text}"));
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            refresh_token: Option<String>,
            expires_in: i64,
            id_token: Option<String>,
        }

        let token_data: TokenResponse = resp
            .json()
            .map_err(|e| format!("Phản hồi token Google không hợp lệ: {e}"))?;

        // Extract email from id_token or userinfo endpoint
        let mut email = None;
        if let Some(ref id_token) = token_data.id_token {
            if let Ok(profile) = GoogleAuthVerifier::new(None).verify_id_token(id_token) {
                email = Some(profile.email);
            }
        }
        if email.is_none() {
            email = fetch_user_email(&self.client, &token_data.access_token);
        }

        let existing_refresh = self.storage.load().ok().flatten().map(|t| t.refresh_token);
        let refresh_token = token_data
            .refresh_token
            .or(existing_refresh)
            .ok_or_else(|| {
                "Google không trả về refresh token. Hãy đăng nhập lại với prompt=consent.".to_string()
            })?;

        let expires_at = Utc::now().timestamp() + token_data.expires_in;
        let stored = StoredTokens {
            access_token: token_data.access_token,
            refresh_token,
            expires_at,
            email: email.clone(),
        };
        self.storage.save(&stored)?;

        Ok(GoogleCalendarAccount {
            connected: true,
            email,
        })
    }

    /// Auto-refresh access token if expired or about to expire in <= 60s.
    pub fn ensure_valid_access_token(&self) -> Result<String, String> {
        let mut tokens = self
            .storage
            .load()?
            .ok_or_else(|| "Chưa kết nối Google Calendar. Vui lòng đăng nhập trước.".to_string())?;

        if tokens.is_expired(60) {
            let client_id = self.client_id.as_deref().ok_or_else(|| {
                "Thiếu GOOGLE_CLIENT_ID để làm mới token Google Calendar.".to_string()
            })?;

            let mut form = vec![
                ("grant_type", "refresh_token"),
                ("refresh_token", tokens.refresh_token.as_str()),
                ("client_id", client_id),
            ];
            if let Some(ref secret) = self.client_secret {
                form.push(("client_secret", secret.as_str()));
            }

            let resp = self
                .client
                .post(GOOGLE_TOKEN_URL)
                .form(&form)
                .send()
                .map_err(|e| format!("Không thể kết nối máy chủ Google để làm mới token: {e}"))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let error_text = resp.text().unwrap_or_default();
                if status.as_u16() == 400 || status.as_u16() == 401 {
                    let _ = self.storage.delete();
                }
                return Err(format!(
                    "Phiên đăng nhập Google Calendar đã hết hạn. Vui lòng đăng nhập lại: {error_text}"
                ));
            }

            #[derive(Deserialize)]
            struct RefreshResponse {
                access_token: String,
                expires_in: i64,
                refresh_token: Option<String>,
            }

            let refresh_data: RefreshResponse = resp
                .json()
                .map_err(|e| format!("Phản hồi làm mới token không hợp lệ: {e}"))?;

            tokens.access_token = refresh_data.access_token;
            tokens.expires_at = Utc::now().timestamp() + refresh_data.expires_in;
            if let Some(new_rt) = refresh_data.refresh_token {
                tokens.refresh_token = new_rt;
            }
            self.storage.save(&tokens)?;
        }

        Ok(tokens.access_token)
    }

    /// Fetch today's events from primary Google Calendar.
    pub fn sync_today(&self) -> Result<Vec<GoogleCalendarEventDto>, String> {
        let access_token = self.ensure_valid_access_token()?;
        let (time_min, time_max) = today_time_window();

        let resp = self
            .client
            .get(GOOGLE_CALENDAR_EVENTS_URL)
            .bearer_auth(&access_token)
            .query(&[
                ("timeMin", time_min.as_str()),
                ("timeMax", time_max.as_str()),
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
            ])
            .send()
            .map_err(|e| format!("Lỗi khi gọi Google Calendar API: {e}"))?;

        if resp.status().as_u16() == 401 {
            // Token might be revoked or expired; force a refresh and retry once
            let mut stored = self.storage.load()?.ok_or("Chưa kết nối Google Calendar.")?;
            stored.expires_at = 0; // force expiry
            self.storage.save(&stored)?;
            let new_token = self.ensure_valid_access_token()?;

            let resp2 = self
                .client
                .get(GOOGLE_CALENDAR_EVENTS_URL)
                .bearer_auth(&new_token)
                .query(&[
                    ("timeMin", time_min.as_str()),
                    ("timeMax", time_max.as_str()),
                    ("singleEvents", "true"),
                    ("orderBy", "startTime"),
                ])
                .send()
                .map_err(|e| format!("Lỗi khi gọi Google Calendar API sau khi làm mới token: {e}"))?;

            if !resp2.status().is_success() {
                return Err(format!(
                    "Google Calendar API lỗi sau khi làm mới token: {}",
                    resp2.status()
                ));
            }
            let body = resp2.text().map_err(|e| e.to_string())?;
            return parse_calendar_events_json(&body);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().unwrap_or_default();
            return Err(format_google_calendar_api_error(status, &err_text));
        }

        let body = resp.text().map_err(|e| e.to_string())?;
        parse_calendar_events_json(&body)
    }

    /// Create a new event on primary Google Calendar and return normalized GoogleCalendarEventDto.
    pub fn create_event(&self, input: CreateCalendarEventDto) -> Result<GoogleCalendarEventDto, String> {
        let summary = input.summary.trim();
        if summary.is_empty() {
            return Err("Tiêu đề sự kiện không được để trống.".to_string());
        }

        let access_token = self.ensure_valid_access_token()?;

        let start_rfc3339 = normalize_to_rfc3339(&input.start_time)?;
        let end_rfc3339 = normalize_to_rfc3339(&input.end_time)?;

        let mut body_map = serde_json::json!({
            "summary": summary,
            "start": { "dateTime": start_rfc3339 },
            "end": { "dateTime": end_rfc3339 }
        });

        if let Some(desc) = input.description.as_deref().filter(|s| !s.trim().is_empty()) {
            body_map["description"] = serde_json::Value::String(desc.trim().to_string());
        }

        if let Some(loc) = input.location.as_deref().filter(|s| !s.trim().is_empty()) {
            body_map["location"] = serde_json::Value::String(loc.trim().to_string());
        }

        let resp = self
            .client
            .post(GOOGLE_CALENDAR_EVENTS_URL)
            .bearer_auth(&access_token)
            .json(&body_map)
            .send()
            .map_err(|e| format!("Lỗi khi gọi Google Calendar API tạo sự kiện: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().unwrap_or_default();
            return Err(format_google_calendar_api_error(status, &err_text));
        }

        let resp_body = resp.text().map_err(|e| e.to_string())?;
        parse_single_calendar_event_json(&resp_body)
    }

    /// Disconnect Google Calendar and delete tokens.
    pub fn disconnect(&self) -> Result<(), String> {
        if let Ok(Some(tokens)) = self.storage.load() {
            let _ = self
                .client
                .post("https://oauth2.googleapis.com/revoke")
                .form(&[("token", tokens.access_token.as_str())])
                .send();
        }
        self.storage.delete()
    }
}

fn fetch_user_email(client: &reqwest::blocking::Client, access_token: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct UserInfo {
        email: Option<String>,
    }
    client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .ok()
        .and_then(|r| r.json::<UserInfo>().ok())
        .and_then(|u| u.email)
}

/// Compute RFC 3339 start of day (00:00:00) and end of day (23:59:59) for local time.
pub fn today_time_window() -> (String, String) {
    today_time_window_from(Local::now())
}

pub fn today_time_window_from<Tz: TimeZone>(now: DateTime<Tz>) -> (String, String)
where
    Tz::Offset: std::fmt::Display,
{
    let today = now.date_naive();
    let start = today.and_hms_opt(0, 0, 0).unwrap();
    let end = today.and_hms_opt(23, 59, 59).unwrap();
    let start_dt = match now.timezone().from_local_datetime(&start) {
        LocalResult::Single(dt) => dt,
        LocalResult::Ambiguous(dt, _) => dt,
        LocalResult::None => now.clone(),
    };
    let end_dt = match now.timezone().from_local_datetime(&end) {
        LocalResult::Single(dt) => dt,
        LocalResult::Ambiguous(_, dt) => dt,
        LocalResult::None => now,
    };
    (start_dt.to_rfc3339(), end_dt.to_rfc3339())
}

/// Formats Google Calendar API error response with actionable guidance (e.g. un-enabled API 403).
pub fn format_google_calendar_api_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = val.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
            if msg.contains("has not been used") || msg.contains("disabled") || msg.contains("accessNotConfigured") {
                return format!(
                    "Google Calendar API chưa được bật trên Google Cloud Console cho dự án này. Vui lòng bật API tại: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com rồi thử lại. (Chi tiết: {msg})"
                );
            }
            if msg.contains("Insufficient Permission") || msg.contains("insufficientPermissions") {
                return format!(
                    "Quyền truy cập hiện tại không đủ để thực hiện thao tác này. Vui lòng ngắt kết nối và đăng nhập lại Google Calendar để cấp quyền chỉnh sửa lịch. (Chi tiết: {msg})"
                );
            }
            return format!("Google Calendar API lỗi ({status}): {msg}");
        }
    }
    format!("Google Calendar API trả về lỗi {status}: {body}")
}

/// Normalizes ISO, RFC3339, or HH:MM time strings into valid RFC3339 timestamps for Google Calendar API.
pub fn normalize_to_rfc3339(time_str: &str) -> Result<String, String> {
    let trimmed = time_str.trim();
    if trimmed.is_empty() {
        return Err("Thời gian sự kiện không được để trống.".into());
    }

    // 1. Full RFC3339
    if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
        return Ok(dt.to_rfc3339());
    }

    // 2. Naive ISO datetime "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DDTHH:MM"
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M"))
    {
        let local_dt = match Local.from_local_datetime(&naive) {
            LocalResult::Single(dt) => dt,
            LocalResult::Ambiguous(dt, _) => dt,
            LocalResult::None => Local::now(),
        };
        return Ok(local_dt.to_rfc3339());
    }

    // 3. Simple time "HH:MM" or "HH:MM:SS" for today
    if let Ok(time) = chrono::NaiveTime::parse_from_str(trimmed, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(trimmed, "%H:%M:%S"))
    {
        let today = Local::now().date_naive();
        let naive = today.and_time(time);
        let local_dt = match Local.from_local_datetime(&naive) {
            LocalResult::Single(dt) => dt,
            LocalResult::Ambiguous(dt, _) => dt,
            LocalResult::None => Local::now(),
        };
        return Ok(local_dt.to_rfc3339());
    }

    Err(format!(
        "Định dạng thời gian không hợp lệ: '{trimmed}'. Vui lòng dùng định dạng RFC3339 hoặc HH:MM."
    ))
}

#[derive(Deserialize)]
struct RawEventItem {
    id: Option<String>,
    summary: Option<String>,
    status: Option<String>,
    start: Option<RawEventTime>,
    end: Option<RawEventTime>,
    #[serde(rename = "hangoutLink")]
    hangout_link: Option<String>,
    location: Option<String>,
    #[serde(rename = "conferenceData")]
    conference_data: Option<RawConferenceData>,
}

#[derive(Deserialize)]
struct RawEventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

#[derive(Deserialize)]
struct RawConferenceData {
    #[serde(rename = "entryPoints", default)]
    entry_points: Vec<RawEntryPoint>,
}

#[derive(Deserialize)]
struct RawEntryPoint {
    uri: Option<String>,
}

fn convert_raw_event_item(item: RawEventItem) -> Option<GoogleCalendarEventDto> {
    if item.status.as_deref() == Some("cancelled") {
        return None;
    }

    let id = item.id.unwrap_or_default();
    let summary = item
        .summary
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "(Không có tiêu đề)".to_string());

    let mut start_time = "00:00".to_string();
    let mut end_time = "23:59".to_string();
    let mut duration_minutes: i64 = 0;

    let start_dt = item
        .start
        .as_ref()
        .and_then(|s| s.date_time.as_deref())
        .and_then(|dt| DateTime::parse_from_rfc3339(dt).ok());
    let end_dt = item
        .end
        .as_ref()
        .and_then(|e| e.date_time.as_deref())
        .and_then(|dt| DateTime::parse_from_rfc3339(dt).ok());

    if let (Some(s_dt), Some(e_dt)) = (start_dt, end_dt) {
        start_time = s_dt.format("%H:%M").to_string();
        end_time = e_dt.format("%H:%M").to_string();
        duration_minutes = (e_dt.signed_duration_since(s_dt)).num_minutes().max(0);
    } else if let Some(s_dt) = start_dt {
        start_time = s_dt.format("%H:%M").to_string();
        end_time = s_dt.format("%H:%M").to_string();
        duration_minutes = 0;
    } else if item
        .start
        .as_ref()
        .and_then(|s| s.date.as_deref())
        .is_some()
    {
        // All-day event
        start_time = "00:00".to_string();
        end_time = "23:59".to_string();
        duration_minutes = 1440;
    }

    let hangout_link = item.hangout_link.filter(|l| !l.trim().is_empty()).or_else(|| {
        item.conference_data.and_then(|cd| {
            cd.entry_points
                .into_iter()
                .find_map(|ep| ep.uri.filter(|u| !u.trim().is_empty()))
        })
    });

    let location = item.location.filter(|loc| !loc.trim().is_empty());

    Some(GoogleCalendarEventDto {
        id,
        summary,
        start_time,
        end_time,
        duration_minutes,
        hangout_link,
        location,
    })
}

/// Parse single Google Calendar API v3 event JSON into `GoogleCalendarEventDto`.
pub fn parse_single_calendar_event_json(json_str: &str) -> Result<GoogleCalendarEventDto, String> {
    let item: RawEventItem =
        serde_json::from_str(json_str).map_err(|e| format!("Lỗi phân tích JSON sự kiện: {e}"))?;
    convert_raw_event_item(item).ok_or_else(|| "Sự kiện không hợp lệ hoặc đã bị hủy.".to_string())
}

/// Parse Google Calendar API v3 JSON response into normalized `Vec<GoogleCalendarEventDto>`.
pub fn parse_calendar_events_json(json_str: &str) -> Result<Vec<GoogleCalendarEventDto>, String> {
    #[derive(Deserialize)]
    struct RawEventList {
        #[serde(default)]
        items: Vec<RawEventItem>,
    }

    let parsed: RawEventList =
        serde_json::from_str(json_str).map_err(|e| format!("Lỗi phân tích JSON sự kiện: {e}"))?;

    let mut events = Vec::new();
    for item in parsed.items {
        if let Some(dto) = convert_raw_event_item(item) {
            events.push(dto);
        }
    }

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, NaiveDate};

    #[test]
    fn test_parse_google_calendar_json() {
        let json_data = r#"{
            "kind": "calendar#events",
            "items": [
                {
                    "id": "event_1",
                    "status": "confirmed",
                    "summary": "CoreAudio Architecture & Sound Routing",
                    "start": { "dateTime": "2026-04-18T09:00:00+07:00" },
                    "end": { "dateTime": "2026-04-18T09:45:00+07:00" },
                    "hangoutLink": "https://meet.google.com/xyz-aud-core",
                    "location": "Room 402"
                },
                {
                    "id": "event_2",
                    "status": "confirmed",
                    "summary": "Voice AI Protocol Sync",
                    "start": { "dateTime": "2026-04-18T10:15:00Z" },
                    "end": { "dateTime": "2026-04-18T11:05:00Z" },
                    "conferenceData": {
                        "entryPoints": [
                            { "entryPointType": "video", "uri": "https://meet.google.com/vce-sync-ai" }
                        ]
                    }
                },
                {
                    "id": "event_3",
                    "status": "confirmed",
                    "summary": "",
                    "start": { "date": "2026-04-18" },
                    "end": { "date": "2026-04-19" }
                },
                {
                    "id": "event_cancelled",
                    "status": "cancelled",
                    "summary": "Cancelled Meeting",
                    "start": { "dateTime": "2026-04-18T14:00:00+07:00" },
                    "end": { "dateTime": "2026-04-18T15:00:00+07:00" }
                }
            ]
        }"#;

        let events = parse_calendar_events_json(json_data).expect("Failed to parse events JSON");
        assert_eq!(events.len(), 3, "Cancelled event should be omitted");

        // Event 1
        assert_eq!(events[0].id, "event_1");
        assert_eq!(events[0].summary, "CoreAudio Architecture & Sound Routing");
        assert_eq!(events[0].start_time, "09:00");
        assert_eq!(events[0].end_time, "09:45");
        assert_eq!(events[0].duration_minutes, 45);
        assert_eq!(
            events[0].hangout_link.as_deref(),
            Some("https://meet.google.com/xyz-aud-core")
        );
        assert_eq!(events[0].location.as_deref(), Some("Room 402"));

        // Event 2 (UTC offset, conferenceData video uri fallback, no location)
        assert_eq!(events[1].id, "event_2");
        assert_eq!(events[1].summary, "Voice AI Protocol Sync");
        assert_eq!(events[1].start_time, "10:15");
        assert_eq!(events[1].end_time, "11:05");
        assert_eq!(events[1].duration_minutes, 50);
        assert_eq!(
            events[1].hangout_link.as_deref(),
            Some("https://meet.google.com/vce-sync-ai")
        );
        assert_eq!(events[1].location, None);

        // Event 3 (All-day event, empty summary fallback)
        assert_eq!(events[2].id, "event_3");
        assert_eq!(events[2].summary, "(Không có tiêu đề)");
        assert_eq!(events[2].start_time, "00:00");
        assert_eq!(events[2].end_time, "23:59");
        assert_eq!(events[2].duration_minutes, 1440);
        assert_eq!(events[2].hangout_link, None);
    }

    #[test]
    fn test_date_time_window() {
        let offset = FixedOffset::east_opt(7 * 3600).unwrap();
        let naive = NaiveDate::from_ymd_opt(2026, 4, 18)
            .unwrap()
            .and_hms_opt(15, 30, 0)
            .unwrap();
        let fixed_time = offset.from_local_datetime(&naive).single().unwrap();

        let (time_min, time_max) = today_time_window_from(fixed_time);
        assert!(time_min.starts_with("2026-04-18T00:00:00+07:00"));
        assert!(time_max.starts_with("2026-04-18T23:59:59+07:00"));

        // Verify parseable by RFC 3339
        assert!(DateTime::parse_from_rfc3339(&time_min).is_ok());
        assert!(DateTime::parse_from_rfc3339(&time_max).is_ok());
    }

    #[test]
    fn test_mock_token_storage() {
        let storage = Arc::new(MockTokenStorage::new());
        let service = GoogleCalendarService::with_storage(
            Some("test-client-id".into()),
            None,
            storage.clone(),
        );

        // Initial status: disconnected
        let status = service.status();
        assert!(!status.connected);
        assert_eq!(status.email, None);

        // Save tokens
        let now = Utc::now().timestamp();
        let tokens = StoredTokens {
            access_token: "mock-access-token".into(),
            refresh_token: "mock-refresh-token".into(),
            expires_at: now + 3600,
            email: Some("engineer@rustsound.app".into()),
        };
        storage.save(&tokens).expect("Save failed");

        // Status: connected with email
        let status = service.status();
        assert!(status.connected);
        assert_eq!(status.email.as_deref(), Some("engineer@rustsound.app"));

        // Disconnect: clear tokens
        service.disconnect().expect("Disconnect failed");
        let status = service.status();
        assert!(!status.connected);
        assert_eq!(status.email, None);
        assert_eq!(storage.load().unwrap(), None);
    }

    #[test]
    fn test_token_expiry_and_auto_refresh() {
        let now = Utc::now().timestamp();
        let valid_tokens = StoredTokens {
            access_token: "valid".into(),
            refresh_token: "refresh".into(),
            expires_at: now + 300,
            email: None,
        };
        assert!(!valid_tokens.is_expired(60));

        let expired_tokens = StoredTokens {
            access_token: "expired".into(),
            refresh_token: "refresh".into(),
            expires_at: now + 30, // less than 60s
            email: None,
        };
        assert!(expired_tokens.is_expired(60));
    }

    #[test]
    fn test_parse_single_google_calendar_json() {
        let json_data = r#"{
            "kind": "calendar#event",
            "id": "single_event_42",
            "status": "confirmed",
            "summary": "Pomodoro Focus Block",
            "start": { "dateTime": "2026-04-18T14:00:00+07:00" },
            "end": { "dateTime": "2026-04-18T15:30:00+07:00" },
            "location": "Quiet Studio"
        }"#;

        let event = parse_single_calendar_event_json(json_data).expect("Failed to parse single event");
        assert_eq!(event.id, "single_event_42");
        assert_eq!(event.summary, "Pomodoro Focus Block");
        assert_eq!(event.start_time, "14:00");
        assert_eq!(event.end_time, "15:30");
        assert_eq!(event.duration_minutes, 90);
        assert_eq!(event.location.as_deref(), Some("Quiet Studio"));
    }

    #[test]
    fn test_normalize_to_rfc3339() {
        // Direct RFC3339
        let rfc = "2026-04-18T10:00:00+07:00";
        let res = normalize_to_rfc3339(rfc).unwrap();
        assert_eq!(res, rfc);

        // Simple time HH:MM
        let time = "15:45";
        let res = normalize_to_rfc3339(time).unwrap();
        assert!(res.contains("T15:45:00"));

        // Invalid string
        assert!(normalize_to_rfc3339("invalid-time").is_err());
    }
}
