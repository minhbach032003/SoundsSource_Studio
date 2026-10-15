use crate::device::AudioDevice;
use crate::process::AudioProcess;
use std::process::Command;

pub fn enumerate_system_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();
    let default_sink = get_default_sink_name();

    if let Ok(output) = Command::new("pactl").args(["list", "sinks"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut cur_id = 0u32;
        let mut cur_name = String::new();
        let mut cur_desc = String::new();

        for line in text.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("Sink #") {
                if cur_id > 0 && !cur_name.is_empty() {
                    let display = if !cur_desc.is_empty() { cur_desc.clone() } else { cur_name.clone() };
                    let is_def = cur_name == default_sink;
                    devices.push(AudioDevice::new(cur_id, display, cur_name.clone(), is_def));
                }
                cur_id = rest.parse().unwrap_or(0);
                cur_name.clear();
                cur_desc.clear();
            } else if let Some(rest) = trimmed.strip_prefix("Name: ") {
                cur_name = rest.to_string();
            } else if let Some(rest) = trimmed.strip_prefix("Description: ") {
                cur_desc = rest.to_string();
            }
        }

        if cur_id > 0 && !cur_name.is_empty() {
            let display = if !cur_desc.is_empty() { cur_desc } else { cur_name.clone() };
            let is_def = cur_name == default_sink;
            devices.push(AudioDevice::new(cur_id, display, cur_name, is_def));
        }
    }

    if devices.is_empty() {
        devices.push(AudioDevice::new(1, "Default Linux Sink (Pulse/PipeWire)", "@DEFAULT_SINK@", true));
    }
    devices
}

pub fn enumerate_system_input_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();
    let default_source = get_default_source_name();

    if let Ok(output) = Command::new("pactl").args(["list", "sources"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut cur_id = 0u32;
        let mut cur_name = String::new();
        let mut cur_desc = String::new();

        for line in text.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("Source #") {
                if cur_id > 0 && !cur_name.is_empty() {
                    let display = if !cur_desc.is_empty() { cur_desc.clone() } else { cur_name.clone() };
                    let is_def = cur_name == default_source;
                    devices.push(AudioDevice::new(cur_id, display, cur_name.clone(), is_def));
                }
                cur_id = rest.parse().unwrap_or(0);
                cur_name.clear();
                cur_desc.clear();
            } else if let Some(rest) = trimmed.strip_prefix("Name: ") {
                cur_name = rest.to_string();
            } else if let Some(rest) = trimmed.strip_prefix("Description: ") {
                cur_desc = rest.to_string();
            }
        }

        if cur_id > 0 && !cur_name.is_empty() {
            let display = if !cur_desc.is_empty() { cur_desc } else { cur_name.clone() };
            let is_def = cur_name == default_source;
            devices.push(AudioDevice::new(cur_id, display, cur_name, is_def));
        }
    }

    if devices.is_empty() {
        devices.push(AudioDevice::new(101, "Default Linux Source (Pulse/PipeWire)", "@DEFAULT_SOURCE@", true));
    }
    devices
}

fn get_default_sink_name() -> String {
    if let Ok(output) = Command::new("pactl").args(["get-default-sink"]).output() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::new()
    }
}

fn get_default_source_name() -> String {
    if let Ok(output) = Command::new("pactl").args(["get-default-source"]).output() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::new()
    }
}

pub fn get_master_volume() -> f32 {
    if let Ok(output) = Command::new("pactl").args(["get-sink-volume", "@DEFAULT_SINK@"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        // text format: Volume: front-left: 65536 / 100% / 0.00 dB, ...
        if let Some(pct_idx) = text.find('%') {
            let prefix = &text[..pct_idx];
            if let Some(space_idx) = prefix.rfind(' ') {
                if let Ok(pct) = prefix[space_idx + 1..].parse::<f32>() {
                    return (pct / 100.0).clamp(0.0, 1.0);
                }
            }
        }
    }
    1.0
}

pub fn set_master_volume(volume: f32) -> Result<(), String> {
    let pct = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    let _ = Command::new("pactl")
        .args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", pct)])
        .output();
    Ok(())
}

pub fn get_master_mute() -> bool {
    if let Ok(output) = Command::new("pactl").args(["get-sink-mute", "@DEFAULT_SINK@"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        text.contains("yes")
    } else {
        false
    }
}

pub fn set_master_mute(muted: bool) -> Result<(), String> {
    let arg = if muted { "1" } else { "0" };
    let _ = Command::new("pactl")
        .args(["set-sink-mute", "@DEFAULT_SINK@", arg])
        .output();
    Ok(())
}

pub fn get_input_volume() -> f32 {
    if let Ok(output) = Command::new("pactl").args(["get-source-volume", "@DEFAULT_SOURCE@"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(pct_idx) = text.find('%') {
            let prefix = &text[..pct_idx];
            if let Some(space_idx) = prefix.rfind(' ') {
                if let Ok(pct) = prefix[space_idx + 1..].parse::<f32>() {
                    return (pct / 100.0).clamp(0.0, 1.0);
                }
            }
        }
    }
    0.85
}

pub fn set_input_volume(volume: f32) -> Result<(), String> {
    let pct = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    let _ = Command::new("pactl")
        .args(["set-source-volume", "@DEFAULT_SOURCE@", &format!("{}%", pct)])
        .output();
    Ok(())
}

pub fn get_input_mute() -> bool {
    if let Ok(output) = Command::new("pactl").args(["get-source-mute", "@DEFAULT_SOURCE@"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        text.contains("yes")
    } else {
        false
    }
}

pub fn set_input_mute(muted: bool) -> Result<(), String> {
    let arg = if muted { "1" } else { "0" };
    let _ = Command::new("pactl")
        .args(["set-source-mute", "@DEFAULT_SOURCE@", arg])
        .output();
    Ok(())
}

pub fn set_default_device(uid: &str) -> Result<(), String> {
    let _ = Command::new("pactl")
        .args(["set-default-sink", uid])
        .output();
    Ok(())
}

pub fn set_default_input_device(uid: &str) -> Result<(), String> {
    let _ = Command::new("pactl")
        .args(["set-default-source", uid])
        .output();
    Ok(())
}

pub fn enumerate_system_processes() -> Vec<AudioProcess> {
    let mut list = Vec::new();

    if let Ok(output) = Command::new("pactl").args(["list", "sink-inputs"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut cur_id = 0u32;
        let mut cur_pid = 0i32;
        let mut cur_name = String::new();
        let mut cur_bin = String::new();
        let mut cur_corked = false;

        for line in text.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("Sink Input #") {
                if cur_id > 0 && (cur_pid > 0 || !cur_name.is_empty()) {
                    let display = if !cur_name.is_empty() { cur_name.clone() } else { cur_bin.clone() };
                    let bundle = if !cur_bin.is_empty() { cur_bin.clone() } else { format!("pid:{}", cur_pid) };
                    list.push(AudioProcess::new(cur_id, cur_pid, bundle, display, !cur_corked, true));
                }
                cur_id = rest.parse().unwrap_or(0);
                cur_pid = 0;
                cur_name.clear();
                cur_bin.clear();
                cur_corked = false;
            } else if let Some(rest) = trimmed.strip_prefix("application.process.id = \"") {
                if let Some(end) = rest.find('"') {
                    cur_pid = rest[..end].parse().unwrap_or(0);
                }
            } else if let Some(rest) = trimmed.strip_prefix("application.name = \"") {
                if let Some(end) = rest.find('"') {
                    cur_name = rest[..end].to_string();
                }
            } else if let Some(rest) = trimmed.strip_prefix("application.process.binary = \"") {
                if let Some(end) = rest.find('"') {
                    cur_bin = rest[..end].to_string();
                }
            } else if trimmed.starts_with("Corked: yes") {
                cur_corked = true;
            }
        }

        if cur_id > 0 && (cur_pid > 0 || !cur_name.is_empty()) {
            let display = if !cur_name.is_empty() { cur_name } else { cur_bin.clone() };
            let bundle = if !cur_bin.is_empty() { cur_bin } else { format!("pid:{}", cur_pid) };
            list.push(AudioProcess::new(cur_id, cur_pid, bundle, display, !cur_corked, true));
        }
    }

    list
}

pub fn set_app_volume(bundle_or_pid: &str, volume: f32) {
    let pct = (volume.clamp(0.0, 1.0) * 100.0).round() as u32;
    // Find sink inputs matching bundle_or_pid
    let procs = enumerate_system_processes();
    for p in procs {
        if p.bundle_id == bundle_or_pid || p.name == bundle_or_pid || format!("{}", p.pid) == bundle_or_pid {
            let _ = Command::new("pactl")
                .args(["set-sink-input-volume", &format!("{}", p.object_id), &format!("{}%", pct)])
                .output();
        }
    }
}

pub fn set_app_mute(bundle_or_pid: &str, muted: bool) {
    let arg = if muted { "1" } else { "0" };
    let procs = enumerate_system_processes();
    for p in procs {
        if p.bundle_id == bundle_or_pid || p.name == bundle_or_pid || format!("{}", p.pid) == bundle_or_pid {
            let _ = Command::new("pactl")
                .args(["set-sink-input-mute", &format!("{}", p.object_id), arg])
                .output();
        }
    }
}
