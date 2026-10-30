//! Screen capture for the AI video call, and what macOS thinks of this build's identity.
//!
//! Two things live here because they are the same user-visible problem: the call asks for
//! Screen Recording, and on an ad-hoc signed build macOS asks again after every rebuild.

use serde::{Deserialize, Serialize};

/// The longest edge the uplink ever sends. Scaling during encode means the oversized
/// original never exists as bytes.
pub const DEFAULT_MAX_EDGE: usize = 1280;
pub const DEFAULT_QUALITY: f64 = 0.8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SigningKind {
    /// Signed with a certificate. The TCC grant is keyed to that certificate, so it
    /// survives rebuilds.
    Certificate,
    /// Signed with `codesign --sign -`. There is no certificate, so macOS keys the grant
    /// to this exact binary's cdhash and every rebuild looks like a different app.
    AdHoc,
    Unsigned,
    /// Not macOS, or the identity could not be read.
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SigningIdentity {
    pub kind: SigningKind,
    /// The signing authority, when there is one.
    pub authority: Option<String>,
    /// True when permissions granted to this build will be forgotten on the next rebuild.
    pub permissions_reset_on_rebuild: bool,
    /// One line the UI can show verbatim.
    pub explanation: String,
}

/// Reads the identity out of `codesign -dvv`. Cheap enough to call once and cache, which
/// is what the Tauri layer does.
pub fn signing_identity() -> SigningIdentity {
    #[cfg(target_os = "macos")]
    {
        let Ok(exe) = std::env::current_exe() else {
            return unknown("Could not locate this app on disk");
        };
        let output = std::process::Command::new("/usr/bin/codesign")
            .args(["-dvv", "--"])
            .arg(&exe)
            .output();
        let Ok(output) = output else {
            return unknown("`codesign` is not available");
        };
        // codesign writes its report to stderr.
        let report = String::from_utf8_lossy(&output.stderr).to_string();
        return describe(&report);
    }
    #[cfg(not(target_os = "macos"))]
    {
        SigningIdentity {
            kind: SigningKind::Unknown,
            authority: None,
            permissions_reset_on_rebuild: false,
            explanation: "Screen capture permissions are not managed this way on this platform"
                .into(),
        }
    }
}

#[cfg(target_os = "macos")]
fn unknown(reason: &str) -> SigningIdentity {
    SigningIdentity {
        kind: SigningKind::Unknown,
        authority: None,
        permissions_reset_on_rebuild: false,
        explanation: reason.to_string(),
    }
}

/// Split out from the process call so the parsing is testable on any platform.
pub fn describe(codesign_report: &str) -> SigningIdentity {
    let authority = codesign_report
        .lines()
        .find_map(|line| line.strip_prefix("Authority="))
        .map(|value| value.trim().to_string());

    let adhoc = codesign_report
        .lines()
        .any(|line| line.trim() == "Signature=adhoc");
    let unsigned = codesign_report
        .lines()
        .any(|line| line.contains("code object is not signed at all"));

    if unsigned {
        return SigningIdentity {
            kind: SigningKind::Unsigned,
            authority: None,
            permissions_reset_on_rebuild: true,
            explanation: "This build is not signed, so macOS cannot remember what you allow it \
                          to do. Screen Recording has to be granted again every time."
                .into(),
        };
    }
    if adhoc {
        return SigningIdentity {
            kind: SigningKind::AdHoc,
            authority,
            permissions_reset_on_rebuild: true,
            explanation: "This build is ad-hoc signed, so macOS identifies it by the exact \
                          binary. Every rebuild looks like a different app and Screen Recording \
                          has to be granted again. Sign with a certificate to keep the grant: \
                          see scripts/macos-signing-identity.sh."
                .into(),
        };
    }
    if authority.is_some() {
        return SigningIdentity {
            kind: SigningKind::Certificate,
            authority,
            permissions_reset_on_rebuild: false,
            explanation: "This build is signed with a certificate, so macOS keeps what you allow \
                          it to do across rebuilds."
                .into(),
        };
    }
    SigningIdentity {
        kind: SigningKind::Unknown,
        authority: None,
        permissions_reset_on_rebuild: false,
        explanation: "Could not read this build's signing identity".into(),
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn rs_capture_main_display_jpeg(
        max_pixel_size: usize,
        quality: f64,
        out_len: *mut usize,
    ) -> *mut u8;
    fn rs_screen_free(ptr: *mut u8);
}

/// One JPEG of the main display, already scaled to `max_edge`.
///
/// Fails when Screen Recording has not been granted; the caller turns that into the
/// message that points at System Settings.
pub fn capture_main_display_jpeg(max_edge: usize, quality: f64) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        let mut len: usize = 0;
        let ptr = unsafe { rs_capture_main_display_jpeg(max_edge, quality, &raw mut len) };
        if ptr.is_null() || len == 0 {
            if !ptr.is_null() {
                unsafe { rs_screen_free(ptr) };
            }
            return Err(
                "Không chụp được màn hình. Cấp quyền Screen Recording cho ứng dụng trong \
                 System Settings rồi thử lại."
                    .into(),
            );
        }
        let bytes = unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec();
        unsafe { rs_screen_free(ptr) };
        Ok(bytes)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (max_edge, quality);
        Err("Chia sẻ màn hình chỉ hỗ trợ trên macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_adhoc_build_is_told_apart_from_a_signed_one() {
        // This is the whole point: the user re-grants Screen Recording after every
        // rebuild and nothing explains why.
        let adhoc = describe(
            "Executable=/Applications/SoundsSource Studio.app/Contents/MacOS/rust-sound\n\
             Identifier=com.soundssource.studio\n\
             Format=app bundle with Mach-O thin (arm64)\n\
             CodeDirectory v=20400 size=1234 flags=0x2(adhoc) hashes=12+7\n\
             Signature=adhoc\n\
             Info.plist entries=24\n",
        );
        assert_eq!(adhoc.kind, SigningKind::AdHoc);
        assert!(adhoc.permissions_reset_on_rebuild);
        assert!(
            adhoc.explanation.contains("Every rebuild"),
            "the message must say why the grant disappears: {}",
            adhoc.explanation
        );
        assert!(
            adhoc.explanation.contains("macos-signing-identity.sh"),
            "and point at the fix: {}",
            adhoc.explanation
        );
    }

    #[test]
    fn a_certificate_signed_build_keeps_its_permissions() {
        let signed = describe(
            "Executable=/Applications/SoundsSource Studio.app/Contents/MacOS/rust-sound\n\
             Identifier=com.soundssource.studio\n\
             Authority=SoundsSource Local Dev\n\
             Signature size=4789\n\
             Info.plist entries=24\n",
        );
        assert_eq!(signed.kind, SigningKind::Certificate);
        assert_eq!(signed.authority.as_deref(), Some("SoundsSource Local Dev"));
        assert!(!signed.permissions_reset_on_rebuild);
    }

    #[test]
    fn an_unsigned_build_says_so_rather_than_reading_as_fine() {
        let bare = describe(
            "/Applications/SoundsSource Studio.app: code object is not signed at all\n",
        );
        assert_eq!(bare.kind, SigningKind::Unsigned);
        assert!(bare.permissions_reset_on_rebuild);
    }

    #[test]
    fn unreadable_output_is_unknown_and_claims_nothing() {
        let nothing = describe("");
        assert_eq!(nothing.kind, SigningKind::Unknown);
        assert!(!nothing.permissions_reset_on_rebuild);
        assert!(nothing.authority.is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_live_screen_capture_returns_jpeg_or_explicit_permission_error() {
        let result = capture_main_display_jpeg(DEFAULT_MAX_EDGE, DEFAULT_QUALITY);
        match result {
            Ok(bytes) => {
                assert!(bytes.len() > 100);
                assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG SOI marker
            }
            Err(e) => {
                assert!(e.contains("Screen Recording") || e.contains("Không chụp được màn hình"));
            }
        }
    }

    #[test]
    fn the_capture_defaults_match_what_the_uplink_actually_sends() {
        // Encoding at the source is the optimisation; if this drifts above the uplink's
        // own cap the webview is scaling a needlessly large image again.
        assert_eq!(DEFAULT_MAX_EDGE, 1280);
        assert!(DEFAULT_QUALITY > 0.0 && DEFAULT_QUALITY <= 1.0);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn capture_off_macos_fails_with_a_reason_instead_of_panicking() {
        let result = capture_main_display_jpeg(DEFAULT_MAX_EDGE, DEFAULT_QUALITY);
        assert!(result.is_err());
    }
}
