//! Google Desktop OAuth callback: IPv4 loopback only, no public web redirect.
use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;
use url::Url;

pub(super) fn bind_listener() -> Result<(TcpListener, String), String> {
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).map_err(|_| "Không mở được callback Google.")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "Không mở được callback Google.")?;
    let port = listener
        .local_addr()
        .map_err(|_| "Không mở được callback Google.")?
        .port();
    Ok((listener, format!("http://127.0.0.1:{port}/callback")))
}

#[derive(Debug, PartialEq)]
enum CallbackError {
    Invalid,
    Denied,
}
fn callback_code(request: &str, port: u16, state: &str) -> Result<String, CallbackError> {
    let invalid = || CallbackError::Invalid;
    if request.len() > 8192 {
        return Err(invalid());
    }
    let (headers, body) = request.split_once("\r\n\r\n").ok_or_else(invalid)?;
    if !body.is_empty() {
        return Err(invalid());
    }
    let mut lines = headers.split("\r\n");
    let mut first = lines.next().ok_or_else(invalid)?.split_whitespace();
    if first.next() != Some("GET") {
        return Err(invalid());
    }
    let target = first.next().ok_or_else(invalid)?;
    if !target.starts_with("/callback?")
        || first.next() != Some("HTTP/1.1")
        || first.next().is_some()
    {
        return Err(invalid());
    }
    let mut hosts = 0;
    for header in lines {
        let (name, value) = header.split_once(':').ok_or_else(invalid)?;
        if name.eq_ignore_ascii_case("host") {
            hosts += 1;
            if value.trim() != format!("127.0.0.1:{port}") {
                return Err(invalid());
            }
        }
        if name.eq_ignore_ascii_case("transfer-encoding")
            || (name.eq_ignore_ascii_case("content-length") && value.trim() != "0")
        {
            return Err(invalid());
        }
    }
    if hosts != 1 {
        return Err(invalid());
    }
    let url = Url::parse(&format!("http://127.0.0.1:{port}{target}")).map_err(|_| invalid())?;
    if url.path() != "/callback" || url.fragment().is_some() {
        return Err(invalid());
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(k, _)| k == "state").collect();
    if states.len() != 1 || !bool::from(states[0].1.as_bytes().ct_eq(state.as_bytes())) {
        return Err(invalid());
    }
    let codes: Vec<_> = pairs.iter().filter(|(k, _)| k == "code").collect();
    let errors = pairs.iter().filter(|(k, _)| k == "error").count();
    if errors == 1 && codes.is_empty() {
        return Err(CallbackError::Denied);
    }
    if errors != 0 || codes.len() != 1 || codes[0].1.is_empty() || codes[0].1.len() > 4096 {
        return Err(invalid());
    }
    Ok(codes[0].1.to_string())
}
pub(super) fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Result<String, String> {
    let start = Instant::now();
    let port = listener
        .local_addr()
        .map_err(|_| "Không nhận được callback Google.")?
        .port();
    let check = || {
        if cancelled.load(Ordering::Acquire) {
            Err("Đã hủy đăng nhập Google.".to_string())
        } else if start.elapsed() >= timeout {
            Err("Đăng nhập hết thời gian. Hãy thử lại.".to_string())
        } else {
            Ok(())
        }
    };
    loop {
        check()?;
        let (mut stream, peer) = match listener.accept() {
            Ok(value) => value,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            Err(_) => return Err("Không nhận được callback Google.".into()),
        };
        if !peer.ip().is_loopback() {
            continue;
        }
        stream
            .set_read_timeout(Some(Duration::from_millis(50)))
            .map_err(|_| "Không đọc được callback Google.")?;
        stream
            .set_write_timeout(Some(Duration::from_millis(100)))
            .map_err(|_| "Không trả lời được trình duyệt.")?;
        let request_start = Instant::now();
        let mut request = Vec::new();
        while request.len() < 8192 && request_start.elapsed() < Duration::from_secs(1) {
            check()?;
            let mut chunk = [0; 1024];
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(size) => request.extend_from_slice(&chunk[..size]),
                Err(error)
                    if matches!(
                        error.kind(),
                        ErrorKind::WouldBlock | ErrorKind::TimedOut | ErrorKind::Interrupted
                    ) =>
                {
                    continue
                }
                Err(_) => break,
            }
            if request.windows(4).any(|v| v == b"\r\n\r\n") {
                break;
            }
        }
        let result = std::str::from_utf8(&request)
            .map_err(|_| CallbackError::Invalid)
            .and_then(|request| callback_code(request, port, state));
        let accepted = result.is_ok() || result == Err(CallbackError::Denied);
        // This acknowledges receipt only. Google verification and database commit have not happened yet.
        let message = if result.is_ok() {
            "Đã nhận phản hồi Google. Quay lại rust-sound để xem kết quả xác thực."
        } else if accepted {
            "Bạn đã hủy đăng nhập. Có thể quay lại rust-sound."
        } else {
            "Yêu cầu callback không hợp lệ."
        };
        let html = format!("<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>rust-sound</title><p>{message}</p></html>");
        let status = if accepted {
            "200 OK"
        } else {
            "400 Bad Request"
        };
        let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'\r\n\r\n{html}", html.len());
        match result {
            Ok(code) => return Ok(code),
            Err(CallbackError::Denied) => return Err("Bạn đã hủy đăng nhập trên Google.".into()),
            Err(CallbackError::Invalid) => continue,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::{atomic::Ordering, Arc};
    use std::time::Instant;
    fn request(port: u16, target: &str) -> String {
        format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n")
    }
    #[test]
    fn callback_requires_exact_state_path_host_method_and_single_code() {
        let good = request(49152, "/callback?state=nonce&code=hello%2Bworld");
        assert_eq!(
            callback_code(&good, 49152, "nonce"),
            Ok("hello+world".into())
        );
        for bad in [
            good.replace("GET ", "POST "),
            good.replace("state=nonce", "state=wrong"),
            good.replace("/callback?", "/other?"),
            good.replace("Host: 127.0.0.1:49152", "Host: evil.test:49152"),
            good.replace("state=nonce", "state=nonce&state=nonce"),
            good.replace("code=hello%2Bworld", "code=a&code=b"),
            good.replace("code=hello%2Bworld", "code="),
            good.replace("code=hello%2Bworld", "code=a&error=denied"),
            good.replace("HTTP/1.1", "HTTP/1.1 trailing"),
            good.replace("\r\n\r\n", "\r\nHost: 127.0.0.1:49152\r\n\r\n"),
            good.replace("\r\n\r\n", "\r\nTransfer-Encoding: chunked\r\n\r\n"),
            good.replace("state=nonce", "state=nonce#fragment"),
            "a".repeat(8193),
        ] {
            assert_eq!(
                callback_code(&bad, 49152, "nonce"),
                Err(CallbackError::Invalid)
            );
        }
        assert_eq!(
            callback_code(
                &request(49152, "/callback?state=nonce&error=access_denied"),
                49152,
                "nonce"
            ),
            Err(CallbackError::Denied)
        );
    }
    #[test]
    fn real_listener_rejects_wrong_request_then_accepts_google_code_without_success_claim() {
        let (listener, redirect) = bind_listener().unwrap();
        let addr = listener.local_addr().unwrap();
        assert!(addr.ip().is_loopback());
        assert!(redirect.ends_with("/callback"));
        let worker = std::thread::spawn(move || {
            wait_for_code(
                &listener,
                "state-123",
                &AtomicBool::new(false),
                Duration::from_secs(3),
            )
        });
        for (target, expected) in [
            ("/callback?state=wrong&code=bad", "400"),
            ("/callback?state=state-123&code=real%2Bcode", "200"),
        ] {
            let mut stream = TcpStream::connect(addr).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            stream
                .write_all(request(addr.port(), target).as_bytes())
                .unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            assert!(response.starts_with(&format!("HTTP/1.1 {expected}")));
            assert!(!response.contains("real+code"));
            assert!(!response.contains("real%2Bcode"));
            assert!(!response.contains("thành công"));
        }
        assert_eq!(worker.join().unwrap().unwrap(), "real+code");
    }
    #[test]
    fn slow_local_connection_cannot_block_cancel_or_login_deadline() {
        let (listener, _) = bind_listener().unwrap();
        let addr = listener.local_addr().unwrap();
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = cancelled.clone();
        let worker = std::thread::spawn(move || {
            wait_for_code(&listener, "nonce", &flag, Duration::from_secs(3))
        });
        let mut slow = TcpStream::connect(addr).unwrap();
        slow.write_all(b"GET /callback").unwrap();
        std::thread::sleep(Duration::from_millis(80));
        let before = Instant::now();
        cancelled.store(true, Ordering::Release);
        assert!(worker.join().unwrap().unwrap_err().contains("hủy"));
        assert!(before.elapsed() < Duration::from_secs(1));
        let (listener, _) = bind_listener().unwrap();
        assert!(wait_for_code(
            &listener,
            "nonce",
            &AtomicBool::new(false),
            Duration::from_millis(80)
        )
        .unwrap_err()
        .contains("hết thời gian"));
    }
}
