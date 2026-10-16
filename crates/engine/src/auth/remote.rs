//! Desktop bridge to the separate auth backend. No DB URL or signing key belongs here.
use super::{
    loopback::{bind_listener, wait_for_code},
    Pkce,
};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use url::Url;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

pub struct RemoteAuth {
    base: String,
    active: Mutex<Option<Arc<AtomicBool>>>,
    credentials: Mutex<()>,
}
impl RemoteAuth {
    pub fn new(base: impl Into<String>) -> Self {
        Self {
            base: base.into(),
            active: Mutex::new(None),
            credentials: Mutex::new(()),
        }
    }
    fn base_url(&self) -> Result<String, String> {
        let url = Url::parse(&self.base).map_err(|_| "Máy chủ đăng nhập chưa được cấu hình.")?;
        if !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
            || !(url.scheme() == "https"
                || (url.scheme() == "http" && url.host_str() == Some("127.0.0.1")))
        {
            return Err("Địa chỉ máy chủ đăng nhập không hợp lệ.".into());
        }
        Ok(url.as_str().trim_end_matches('/').to_owned())
    }
    fn client(&self) -> Result<Client, String> {
        Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Không khởi tạo được kết nối đăng nhập.".into())
    }
    fn account(&self) -> Result<String, String> {
        Ok(format!(
            "rust-sound-google:{}",
            Pkce::compute_s256_challenge(&self.base_url()?)
        ))
    }
    pub fn cancel(&self) {
        if let Some(flag) = self.active.lock().unwrap().as_ref() {
            flag.store(true, Ordering::Release);
        }
    }
    pub fn begin_login(&self) -> Result<Arc<AtomicBool>, String> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut active = self.active.lock().unwrap();
        if active.is_some() {
            return Err("Đang có một lần đăng nhập. Hãy hoàn tất hoặc hủy trước.".into());
        }
        *active = Some(flag.clone());
        Ok(flag)
    }
    pub fn login(&self, flag: Arc<AtomicBool>) -> Result<RemoteUser, String> {
        let result = self.login_inner(&flag);
        *self.active.lock().unwrap() = None;
        result
    }
    fn login_inner(&self, cancelled: &AtomicBool) -> Result<RemoteUser, String> {
        let _guard = self.credentials.lock().unwrap();
        if cancelled.load(Ordering::Acquire) {
            return Err("Đã hủy đăng nhập Google.".into());
        }
        let base = self.base_url()?;
        let client = self.client()?;
        let (listener, redirect_uri) = bind_listener()?;
        let pkce = Pkce::generate_challenge();
        let response = client
            .post(format!("{base}/auth/google/start"))
            .json(&serde_json::json!({"challenge": pkce.code_challenge, "redirect_uri": redirect_uri}))
            .send()
            .map_err(|_| unavailable())?;
        #[derive(Deserialize)]
        struct Start {
            login_id: String,
            authorization_url: String,
        }
        let start: Start = response_json(response)?;
        if start.login_id.len() != 43 {
            return Err("Máy chủ trả về yêu cầu đăng nhập không hợp lệ.".into());
        }
        let state = authorization_state(
            &start.authorization_url,
            &redirect_uri,
            &pkce.code_challenge,
        )
        .ok_or("Máy chủ trả về yêu cầu đăng nhập không hợp lệ.")?;
        let proof = serde_json::json!({"login_id": start.login_id, "verifier": pkce.code_verifier});
        let cancel = || {
            let _ = client
                .post(format!("{base}/auth/google/cancel"))
                .json(&proof)
                .send();
        };
        if cancelled.load(Ordering::Acquire) {
            cancel();
            return Err("Đã hủy đăng nhập Google.".into());
        }
        #[cfg(target_os = "macos")]
        let opened = std::process::Command::new("/usr/bin/open")
            .arg(&start.authorization_url)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        #[cfg(not(target_os = "macos"))]
        let opened = false;
        if !opened {
            cancel();
            return Err("Không mở được trình duyệt Google.".into());
        }
        let code = match wait_for_code(&listener, &state, cancelled, Duration::from_secs(180)) {
            Ok(code) => code,
            Err(error) => {
                cancel();
                return Err(error);
            }
        };
        drop(listener); // No callback port remains open during server verification.
        if cancelled.load(Ordering::Acquire) {
            cancel();
            return Err("Đã hủy đăng nhập Google.".into());
        }
        let response = client.post(format!("{base}/auth/google/complete"))
            .json(&serde_json::json!({"login_id": start.login_id, "verifier": pkce.code_verifier, "code": code, "state": state}))
            .timeout(Duration::from_secs(40))
            .send().map_err(|_| unavailable())?;
        #[derive(Deserialize)]
        struct Complete {
            user: RemoteUser,
            token: String,
        }
        let complete: Complete = response_json(response)?;
        if complete.token.len() > 8192 || complete.token.is_empty() {
            return Err(unavailable());
        }
        validate_user(&complete.user)?;
        if cancelled.load(Ordering::Acquire) {
            let _ = client
                .post(format!("{base}/auth/logout"))
                .bearer_auth(&complete.token)
                .send();
            return Err("Đã hủy đăng nhập Google.".into());
        }
        if let Err(error) =
            sound_core::spotify::refresh_token(&self.account()?, Some(Some(&complete.token)))
        {
            let _ = client
                .post(format!("{base}/auth/logout"))
                .bearer_auth(&complete.token)
                .send();
            return Err(error);
        }
        Ok(complete.user)
    }
    pub fn restore(&self) -> Result<Option<RemoteUser>, String> {
        let _guard = self.credentials.lock().unwrap();
        let base = self.base_url()?;
        let account = self.account()?;
        let Some(token) = sound_core::spotify::refresh_token(&account, None)? else {
            return Ok(None);
        };
        let response = self
            .client()?
            .get(format!("{base}/auth/session"))
            .bearer_auth(&token)
            .send()
            .map_err(|_| unavailable())?;
        if response.status().as_u16() == 401 {
            sound_core::spotify::refresh_token(&account, Some(None))?;
            return Ok(None);
        }
        #[derive(Deserialize)]
        struct Session {
            user: RemoteUser,
        }
        let session: Session = response_json(response)?;
        validate_user(&session.user)?;
        Ok(Some(session.user))
    }
    pub fn logout(&self, discard_cancelled_login: bool) -> Result<(), String> {
        self.cancel();
        let _guard = self.credentials.lock().unwrap();
        let base = self.base_url()?;
        let account = self.account()?;
        let mut revocation = Ok(());
        if let Some(token) = sound_core::spotify::refresh_token(&account, None)? {
            revocation = self
                .client()?
                .post(format!("{base}/auth/logout"))
                .bearer_auth(&token)
                .send()
                .map_err(|_| unavailable())
                .and_then(|response| {
                    if response.status().is_success() || response.status().as_u16() == 401 {
                        Ok(())
                    } else {
                        Err(unavailable())
                    }
                });
        }
        if revocation.is_ok() || discard_cancelled_login {
            // Cancelled login must not become a hidden restorable session even when remote cleanup is offline.
            sound_core::spotify::refresh_token(&account, Some(None))?;
        }
        revocation
    }
}
fn unavailable() -> String {
    "Không kết nối được máy chủ đăng nhập. Kiểm tra cấu hình và thử lại.".into()
}
fn validate_user(user: &RemoteUser) -> Result<(), String> {
    if user.id.is_empty()
        || user.id.len() > 128
        || user.email.len() > 320
        || !user.email.contains('@')
        || user.name.chars().count() > 200
    {
        return Err(unavailable());
    }
    Ok(())
}
fn response_json<T: serde::de::DeserializeOwned>(
    response: reqwest::blocking::Response,
) -> Result<T, String> {
    use std::io::Read;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            400 | 401 => "Đăng nhập bị từ chối hoặc đã hết hạn. Hãy thử lại.".into(),
            429 => "Có quá nhiều yêu cầu đăng nhập. Vui lòng đợi rồi thử lại.".into(),
            _ => unavailable(),
        });
    }
    let mut body = Vec::new();
    response
        .take(65537)
        .read_to_end(&mut body)
        .map_err(|_| unavailable())?;
    if body.len() > 65536 {
        return Err(unavailable());
    }
    serde_json::from_slice(&body).map_err(|_| unavailable())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backend_url_accepts_only_https_or_exact_loopback_without_credentials_or_path() {
        for good in ["https://auth.example.com", "http://127.0.0.1:8787"] {
            assert_eq!(RemoteAuth::new(good).base_url().unwrap(), good);
        }
        for bad in [
            "",
            "http://remote.example",
            "https://user:pass@auth.example",
            "https://auth.example/x",
            "https://auth.example/?token=secret",
            "file:///tmp/auth",
            "http://127.0.0.1.evil.test",
        ] {
            assert!(RemoteAuth::new(bad).base_url().is_err());
        }
    }
    #[test]
    fn cancellation_is_registered_before_blocking_worker_starts() {
        let auth = RemoteAuth::new("https://auth.example.com");
        let flag = auth.begin_login().unwrap();
        assert!(auth.begin_login().is_err());
        auth.cancel();
        assert!(flag.load(Ordering::Acquire));
        assert!(auth.login(flag).unwrap_err().contains("hủy"));
        assert!(auth.begin_login().is_ok());
    }
    #[test]
    fn authorization_binds_native_listener_and_pkce_before_opening_browser() {
        let redirect = "http://127.0.0.1:49152/callback";
        let challenge = "a".repeat(43);
        let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("response_type", "code"),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
            ("redirect_uri", redirect),
            ("state", &"s".repeat(43)),
        ]);
        assert_eq!(
            authorization_state(url.as_str(), redirect, &challenge),
            Some("s".repeat(43))
        );
        assert!(
            authorization_state(url.as_str(), "http://127.0.0.1:49153/callback", &challenge)
                .is_none()
        );
        assert!(authorization_state(url.as_str(), redirect, &"b".repeat(43)).is_none());
        url.query_pairs_mut().append_pair("state", "duplicate");
        assert!(authorization_state(url.as_str(), redirect, &challenge).is_none());
    }
    #[test]
    fn browser_url_cannot_escape_google_or_omit_pkce() {
        assert!(valid_authorization(
            "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&code_challenge_method=S256&code_challenge=abc"
        ));
        for bad in [
            "https://accounts.google.com.evil.test/o/oauth2/v2/auth",
            "http://accounts.google.com/o/oauth2/v2/auth",
            "https://user@accounts.google.com/o/oauth2/v2/auth",
            "https://accounts.google.com/o/oauth2/v2/auth",
        ] {
            assert!(!valid_authorization(bad));
        }
    }
}
fn authorization_state(value: &str, redirect: &str, challenge: &str) -> Option<String> {
    if !valid_authorization(value) {
        return None;
    }
    let url = Url::parse(value).ok()?;
    let pairs: Vec<_> = url.query_pairs().collect();
    let one = |key: &str| {
        let mut values = pairs
            .iter()
            .filter(|(k, _)| k == key)
            .map(|(_, v)| v.to_string());
        let first = values.next()?;
        if values.next().is_some() {
            None
        } else {
            Some(first)
        }
    };
    if one("redirect_uri")?.as_str() != redirect
        || one("code_challenge")?.as_str() != challenge
        || one("response_type")?.as_str() != "code"
        || one("code_challenge_method")?.as_str() != "S256"
    {
        return None;
    }
    let state = one("state")?;
    (state.len() == 43
        && state
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'))
    .then_some(state)
}
fn valid_authorization(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    value.len() <= 8192
        && url.scheme() == "https"
        && url.host_str() == Some("accounts.google.com")
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && url.path() == "/o/oauth2/v2/auth"
        && url
            .query_pairs()
            .any(|(k, v)| k == "response_type" && v == "code")
        && url
            .query_pairs()
            .any(|(k, v)| k == "code_challenge_method" && v == "S256")
        && url
            .query_pairs()
            .any(|(k, v)| k == "code_challenge" && !v.is_empty())
}
