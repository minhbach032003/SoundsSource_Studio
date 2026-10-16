//! Bounded decoding metadata and animation helpers for bundled WebP and custom emotes.
use crate::model::EMOTE_ASSETS;
use crate::settings::is_custom_emote;

pub const MAX_IMAGE_DIMENSION: u32 = 2048;
pub const MAX_FRAMES: usize = 300;
pub const MAX_DURATION_MS: u32 = 30_000;
pub const MAX_DECODED_BYTES: usize = 128 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Gif,
    WebP,
}

impl ImageFormat {
    pub const fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::WebP => "webp",
        }
    }
}

pub fn guess_format(bytes: &[u8]) -> Result<ImageFormat, &'static str> {
    if bytes.len() < 12 {
        return Err("Choose a valid PNG, JPG, GIF or WebP image");
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok(ImageFormat::Png);
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok(ImageFormat::Jpeg);
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok(ImageFormat::Gif);
    }
    if bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Ok(ImageFormat::WebP);
    }
    Err("Choose a valid PNG, JPG, GIF or WebP image")
}

pub fn validate_dimensions(width: u32, height: u32) -> Result<(), &'static str> {
    if width == 0 || height == 0 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
        return Err("Image dimensions must be 1–2048px");
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq)]
pub struct AnimatedFrame {
    pub at_ms: u32,
    pub end_ms: u32,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

/// Checks whether an emote slug represents an animated emote.
pub fn has_animation(slug: &str) -> bool {
    if is_custom_emote(slug) {
        crate::custom_emotes::animated(slug)
    } else {
        EMOTE_ASSETS.contains(&slug)
    }
}

/// Custom animations loop only within the normal temporary emote lifetime.
pub fn playback_ms(slug: &str, duration_ms: u32, elapsed: u32) -> u32 {
    if is_custom_emote(slug) {
        if duration_ms == 0 {
            elapsed
        } else {
            elapsed % duration_ms
        }
    } else {
        elapsed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_detection_recognizes_valid_image_headers() {
        assert_eq!(
            guess_format(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR").unwrap(),
            ImageFormat::Png
        );
        assert_eq!(
            guess_format(&[0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).unwrap(),
            ImageFormat::Jpeg
        );
        assert_eq!(
            guess_format(b"GIF89a\x01\x00\x01\x00\x80\x00\x00").unwrap(),
            ImageFormat::Gif
        );
        assert_eq!(
            guess_format(b"RIFF\x00\x00\x00\x00WEBPVP8 ").unwrap(),
            ImageFormat::WebP
        );
        assert!(guess_format(b"not an image").is_err());
        assert!(guess_format(b"short").is_err());
    }

    #[test]
    fn dimension_validation_enforces_bounds() {
        assert!(validate_dimensions(1, 1).is_ok());
        assert!(validate_dimensions(2048, 2048).is_ok());
        assert!(validate_dimensions(0, 100).is_err());
        assert!(validate_dimensions(100, 0).is_err());
        assert!(validate_dimensions(2049, 100).is_err());
        assert!(validate_dimensions(100, 2049).is_err());
    }

    #[test]
    fn playback_loops_custom_emotes_and_preserves_builtin() {
        let custom = "custom_0123456789abcdef";
        assert_eq!(playback_ms(custom, 100, 50), 50);
        assert_eq!(playback_ms(custom, 100, 150), 50);
        assert_eq!(playback_ms(custom, 100, 300), 0);
        assert_eq!(playback_ms("facepalm", 100, 150), 150);
    }

    #[test]
    fn has_animation_identifies_builtin_emotes() {
        assert!(has_animation("facepalm"));
        assert!(has_animation("angry_kitty"));
        assert!(!has_animation("nonexistent_emote"));
    }
}
