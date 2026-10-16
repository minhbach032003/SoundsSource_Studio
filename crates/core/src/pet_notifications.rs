//! Silent, local AgentPet alerts. Permission is requested only by the explicit UI command.
#[cfg(target_os = "macos")]
mod macos {
    use block2::RcBlock;
    use futures_channel::oneshot;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSBundle, NSError, NSString};
    use objc2_user_notifications::*;
    use std::{ptr::NonNull, sync::Mutex};

    fn available() -> bool {
        let bundle = NSBundle::mainBundle();
        bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
    }

    pub async fn status() -> Result<String, String> {
        if !available() { return Ok("unavailable".into()); }
        let (tx, rx) = oneshot::channel();
        {
        let tx = Mutex::new(Some(tx));
        let callback = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            // Apple's callback owns a valid settings object for the duration of this call.
            let state = unsafe { settings.as_ref() }.authorizationStatus();
            let name = if state == UNAuthorizationStatus::Authorized { "granted" }
                else if state == UNAuthorizationStatus::Provisional { "provisional" }
                else if state == UNAuthorizationStatus::Denied { "denied" }
                else { "default" };
            if let Some(tx) = tx.lock().unwrap().take() { let _ = tx.send(name.to_string()); }
        });
        UNUserNotificationCenter::currentNotificationCenter().getNotificationSettingsWithCompletionHandler(&callback);
        }
        rx.await.map_err(|_| "Notification status callback was cancelled".into())
    }

    pub async fn request() -> Result<String, String> {
        if !available() { return Ok("unavailable".into()); }
        let (tx, rx) = oneshot::channel();
        {
        let tx = Mutex::new(Some(tx));
        let callback = RcBlock::new(move |_granted: Bool, error: *mut NSError| {
            let result = if error.is_null() { Ok(()) } else {
                Err(unsafe { &*error }.localizedDescription().to_string())
            };
            if let Some(tx) = tx.lock().unwrap().take() { let _ = tx.send(result); }
        });
        // No sound authorization: sounds are controlled separately by Web Audio.
        UNUserNotificationCenter::currentNotificationCenter().requestAuthorizationWithOptions_completionHandler(UNAuthorizationOptions::Alert, &callback);
        }
        rx.await.map_err(|_| "Notification permission callback was cancelled".to_string())??;
        status().await
    }

    pub async fn send(title: String, body: String) -> Result<(), String> {
        let state = status().await?;
        if state != "granted" && state != "provisional" { return Err("Notifications are not authorized; enable them in AgentPet Settings".into()); }
        let (tx, rx) = oneshot::channel();
        {
        let tx = Mutex::new(Some(tx));
        let callback = RcBlock::new(move |error: *mut NSError| {
            let result = if error.is_null() { Ok(()) } else { Err(unsafe { &*error }.localizedDescription().to_string()) };
            if let Some(tx) = tx.lock().unwrap().take() { let _ = tx.send(result); }
        });
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&title));
        content.setBody(&NSString::from_str(&body));
        // Intentionally leave content.sound nil: notification mute and sound toggles are independent.
        let identifier = format!("agentpet-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&NSString::from_str(&identifier), &content, None);
        UNUserNotificationCenter::currentNotificationCenter().addNotificationRequest_withCompletionHandler(&request, Some(&callback));
        }
        rx.await.map_err(|_| "Notification delivery callback was cancelled".to_string())?
    }
}
#[cfg(target_os = "macos")]
pub use macos::{request, send, status};
#[cfg(not(target_os = "macos"))]
pub async fn status() -> Result<String, String> { Ok("unavailable".into()) }
#[cfg(not(target_os = "macos"))]
pub async fn request() -> Result<String, String> { status().await }
#[cfg(not(target_os = "macos"))]
pub async fn send(_: String, _: String) -> Result<(), String> { Err("Native notifications require macOS".into()) }
