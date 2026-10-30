//! Native smoke driver: refuses to mutate anything except the disposable fixture.
//! Used by tests/desktop-native-smoke.mjs; never points at a user's existing tab.
use sound_core::desktop::{DesktopAction, PreparedDesktopAction};
fn main() -> Result<(), String> {
    let json = std::env::args().nth(1).ok_or("Missing action JSON")?;
    let action: DesktopAction = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let prepared = PreparedDesktopAction::prepare(action)?;
    if !prepared
        .target_label
        .contains("SoundsSource Desktop Fixture")
    {
        return Err("Refusing native smoke test: target is not the disposable fixture".into());
    }
    println!(
        "{}",
        serde_json::to_string(&prepared.execute()?).map_err(|e| e.to_string())?
    );
    // Keep the short-lived test sender alive while WindowServer drains the event queue.
    std::thread::sleep(std::time::Duration::from_millis(100));
    Ok(())
}
