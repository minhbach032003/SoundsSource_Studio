//! Local image library; IPC-supplied paths/filenames never become filesystem paths.
use crate::animation::{guess_format, ImageFormat};
use crate::settings::is_custom_emote;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

pub const MAX_INPUT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_FILES: usize = 16;
pub const MAX_LIBRARY_BYTES: u64 = 32 * 1024 * 1024;

static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
static IMPORT: Mutex<()> = Mutex::new(());

pub fn initialize(settings: &Path) {
    if let Some(parent) = settings.parent() {
        let _ = DIRECTORY.set(parent.join("custom-emotes"));
    }
}

pub fn directory() -> Result<&'static Path, String> {
    DIRECTORY
        .get()
        .map(PathBuf::as_path)
        .ok_or_else(|| "Emote library is unavailable".into())
}

pub fn read_file(directory: &Path, id: &str, extension: &str) -> Option<Vec<u8>> {
    if !is_custom_emote(id) || !["png", "gif", "webp", "jpg"].contains(&extension) {
        return None;
    }
    let path = directory.join(format!("{id}.{extension}"));
    if !fs::symlink_metadata(&path).ok()?.file_type().is_file() {
        return None;
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(MAX_INPUT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (!bytes.is_empty() && bytes.len() <= MAX_INPUT_BYTES).then_some(bytes)
}

pub fn stored(directory: &Path, id: &str) -> Option<(Vec<u8>, &'static str)> {
    ["png", "gif", "webp", "jpg"]
        .into_iter()
        .find_map(|ext| read_file(directory, id, ext).map(|bytes| (bytes, ext)))
}

pub fn media(id: &str) -> Option<(Vec<u8>, &'static str)> {
    stored(directory().ok()?, id)
}

pub fn animated(id: &str) -> bool {
    if !is_custom_emote(id) {
        return false;
    }
    let Ok(dir) = directory() else { return false };
    ["gif", "webp"].into_iter().any(|ext| {
        fs::symlink_metadata(dir.join(format!("{id}.{ext}"))).is_ok_and(|m| m.file_type().is_file())
    })
}

pub fn exists(id: &str) -> bool {
    media(id).is_some()
}

pub fn ids(directory: &Path) -> Vec<String> {
    let mut ids: Vec<_> = fs::read_dir(directory)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_type().is_ok_and(|t| t.is_file())
                && e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .is_some_and(|x| ["png", "gif", "webp", "jpg"].contains(&x))
        })
        .filter_map(|e| e.path().file_stem()?.to_str().map(str::to_owned))
        .filter(|id| is_custom_emote(id))
        .collect();
    ids.sort();
    ids.dedup();
    ids.truncate(MAX_FILES);
    ids
}

pub fn catalog() -> Vec<(String, Vec<u8>)> {
    let Ok(dir) = directory() else {
        return Vec::new();
    };
    ids(dir)
        .into_iter()
        .filter_map(|id| {
            let (bytes, _) = stored(dir, &id)?;
            Some((id, bytes))
        })
        .collect()
}

pub fn import(bytes: &[u8]) -> Result<String, String> {
    let _guard = IMPORT
        .try_lock()
        .map_err(|_| "Another emote import is in progress")?;
    import_into(directory()?, bytes)
}

pub fn import_into(directory: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return Err("Choose a PNG, JPG, GIF or WebP up to 8 MiB".into());
    }
    let format = guess_format(bytes)?;
    let extension = match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::Gif => "gif",
        ImageFormat::WebP => "webp",
    };

    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut library_bytes = 0u64;
    for id in ids(directory) {
        for ext in ["png", "gif", "webp", "jpg"] {
            if let Ok(metadata) = fs::symlink_metadata(directory.join(format!("{id}.{ext}"))) {
                library_bytes = library_bytes.saturating_add(metadata.len());
            }
        }
        if stored(directory, &id)
            .is_some_and(|(existing, ext)| ext == extension && existing == bytes)
        {
            return Ok(id);
        }
    }
    if ids(directory).len() >= MAX_FILES {
        return Err("Custom emote library is full (16 images)".into());
    }
    if library_bytes.saturating_add(bytes.len() as u64) > MAX_LIBRARY_BYTES {
        return Err("Custom emote library exceeds 32 MiB".into());
    }

    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos() as u64;
    let id = format!("custom_{stamp:016x}");
    file.persist_noclobber(directory.join(format!("{id}.{extension}")))
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DUMMY_PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89";
    const DUMMY_GIF: &[u8] = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;";

    #[test]
    fn imported_image_is_persistent_deduplicated_and_path_safe() {
        let dir = tempfile::tempdir().unwrap();
        let id = import_into(dir.path(), DUMMY_PNG).unwrap();
        assert!(is_custom_emote(&id));

        // Deduplication returns same id
        assert_eq!(import_into(dir.path(), DUMMY_PNG).unwrap(), id);

        // Can read back
        let restored = read_file(dir.path(), &id, "png").unwrap();
        assert_eq!(restored, DUMMY_PNG);

        // Path safety: directory traversal is rejected
        assert!(read_file(dir.path(), "../../settings", "png").is_none());
        assert!(import_into(dir.path(), b"not an image").is_err());
        assert!(import_into(dir.path(), &vec![0; MAX_INPUT_BYTES + 1]).is_err());
    }

    #[test]
    fn enforces_max_files_limit() {
        let dir = tempfile::tempdir().unwrap();
        for n in 0..MAX_FILES {
            fs::write(dir.path().join(format!("custom_{n:016x}.png")), DUMMY_PNG).unwrap();
        }
        let different_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x02\x08\x06\x00\x00\x00\x1f\x15\xc4\x89";
        assert!(import_into(dir.path(), different_png).is_err());
    }

    #[test]
    fn animated_detects_gif_format() {
        let dir = tempfile::tempdir().unwrap();
        let id = import_into(dir.path(), DUMMY_GIF).unwrap();
        let (bytes, ext) = stored(dir.path(), &id).unwrap();
        assert_eq!(ext, "gif");
        assert_eq!(bytes, DUMMY_GIF);
    }
}
