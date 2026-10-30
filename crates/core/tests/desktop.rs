use serde_json::json;
use sound_core::desktop::DesktopAction;

#[test]
fn desktop_boundary_rejects_invalid_or_executable_arguments() {
    for value in [
        json!({"kind":"click","bundle_id":"com.google.Chrome","x":1001,"y":0}),
        json!({"kind":"type_text","bundle_id":"com.google.Chrome","text":"a".repeat(2001)}),
        json!({"kind":"type_text","bundle_id":"com.google.Chrome","text":"hello\nrm -rf"}),
        json!({"kind":"press_key","bundle_id":"com.google.Chrome","key":"do shell script"}),
        json!({"kind":"click","bundle_id":"bad;script","x":1,"y":1}),
        json!({"kind":"close_chrome_tab","approved":true}),
        json!({"kind":"scroll","bundle_id":"com.google.Chrome","x":0,"y":0,"direction":"down","amount":9999}),
    ] {
        let result = serde_json::from_value::<DesktopAction>(value)
            .and_then(|a| a.validate().map_err(serde::de::Error::custom));
        assert!(result.is_err());
    }
    let action: DesktopAction = serde_json::from_value(json!({
        "kind":"type_text", "bundle_id":"com.google.Chrome", "text":"Tiếng Việt 日本語"
    }))
    .unwrap();
    assert!(action.validate().is_ok());
    assert!(
        serde_json::from_value::<DesktopAction>(json!({"kind":"close_chrome_tab"}))
            .unwrap()
            .validate()
            .is_ok()
    );
}
