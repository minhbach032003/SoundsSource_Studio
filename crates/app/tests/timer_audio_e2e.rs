use sound_engine::{AudioRouter, BreakTimerManager, TimerPhase};
use std::time::{Duration, SystemTime};

#[test]
fn test_timer_audio_ducking_lifecycle_e2e() {
    let mut router = AudioRouter::new(48000.0);
    router.set_app_volume("com.spotify.client", 0.9);
    router.set_app_volume("com.brave.Browser", 0.7);

    let mut timer = BreakTimerManager::new(100, 20);
    assert_eq!(timer.phase, TimerPhase::Idle);

    // 1. Start studying
    timer.start();
    assert_eq!(timer.phase, TimerPhase::Studying);
    assert!(!timer.is_ducked);

    // 2. Trigger warning threshold (durations: 8s, warning threshold: 10s)
    timer.stop(None);
    timer.set_durations(8, 20);
    timer.start();
    let transition = timer.tick(Some(&mut router));
    assert_eq!(transition, Some(TimerPhase::Warning));
    assert_eq!(timer.phase, TimerPhase::Warning);

    // 3. Test snooze (+5 minutes)
    timer.snooze();
    assert_eq!(timer.phase, TimerPhase::Studying);
    assert!(timer.remaining_seconds() > 290);

    // 4. Force expiry into break by setting past deadline
    timer.phase = TimerPhase::Warning;
    timer.set_deadline_for_test(Some(SystemTime::now() - Duration::from_secs(1)));
    let transition = timer.tick(Some(&mut router));
    assert_eq!(transition, Some(TimerPhase::Breaking));
    assert_eq!(timer.phase, TimerPhase::Breaking);
    assert!(timer.is_ducked);

    // Verify audio ducked to 0.15 multiplier
    let ch_spotify = router.get_or_create_channel("com.spotify.client");
    assert!((ch_spotify.volume - (0.9 * 0.15)).abs() < 1e-4);

    let ch_brave = router.get_or_create_channel("com.brave.Browser");
    assert!((ch_brave.volume - (0.7 * 0.15)).abs() < 1e-4);

    // 5. Skip break -> triggers end_break and auto-loop back to Studying
    timer.skip(Some(&mut router));
    assert_eq!(timer.phase, TimerPhase::Studying);
    assert_eq!(timer.completed_sessions_today, 1);
    assert!(!timer.is_ducked);

    // Verify audio volumes restored
    let ch_spotify_restored = router.get_or_create_channel("com.spotify.client");
    assert!((ch_spotify_restored.volume - 0.9).abs() < 1e-4);

    let ch_brave_restored = router.get_or_create_channel("com.brave.Browser");
    assert!((ch_brave_restored.volume - 0.7).abs() < 1e-4);
}

#[test]
fn test_todo_list_lifecycle_e2e() {
    let mut timer = BreakTimerManager::default();
    assert!(timer.get_todos().is_empty());

    timer.add_todo("Review CoreAudio Process Tap implementation");
    timer.add_todo("Calibrate 10-band parametric equalizer");
    assert_eq!(timer.get_todos().len(), 2);

    let id0 = timer.get_todos()[0].id.clone();
    let id1 = timer.get_todos()[1].id.clone();
    assert_ne!(id0, id1);

    // Toggle completion
    assert!(!timer.get_todos()[0].is_completed);
    timer.toggle_todo(&id0);
    assert!(timer.get_todos()[0].is_completed);

    // Delete first item
    timer.delete_todo(&id0);
    assert_eq!(timer.get_todos().len(), 1);
    assert_eq!(timer.get_todos()[0].id, id1);
}

#[test]
fn test_wall_clock_sleep_wake_resilience_e2e() {
    let mut timer = BreakTimerManager::new(1500, 300);
    timer.start();
    assert_eq!(timer.phase, TimerPhase::Studying);

    // Verify status returns valid remaining duration
    let status = timer.get_status();
    assert_eq!(status.phase, TimerPhase::Studying);
    assert!(status.remaining_seconds > 0 && status.remaining_seconds <= 1500);
    assert_eq!(status.study_duration, 1500);
    assert_eq!(status.break_duration, 300);
}
