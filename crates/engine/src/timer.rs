use crate::router::AudioRouter;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerPhase {
    Idle,
    Studying,
    Warning,
    Breaking,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub title: String,
    pub is_completed: bool,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub duration_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerStatus {
    pub phase: TimerPhase,
    pub remaining_seconds: u64,
    pub study_duration: u64,
    pub break_duration: u64,
    pub completed_sessions: u32,
    pub is_ducked: bool,
}

pub struct BreakTimerManager {
    pub phase: TimerPhase,
    deadline: Option<SystemTime>,
    pub study_duration: u64,
    pub break_duration: u64,
    pub warning_threshold: u64,
    pub completed_sessions_today: u32,
    pub todo_items: Vec<TodoItem>,
    pre_break_volumes: HashMap<String, f32>,
    pub is_ducked: bool,
}

static TODO_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

impl Default for BreakTimerManager {
    fn default() -> Self {
        Self::new(25 * 60, 5 * 60)
    }
}

impl BreakTimerManager {
    pub fn new(study_seconds: u64, break_seconds: u64) -> Self {
        Self {
            phase: TimerPhase::Idle,
            deadline: None,
            study_duration: study_seconds.max(1),
            break_duration: break_seconds.max(1),
            warning_threshold: 10,
            completed_sessions_today: 0,
            todo_items: Vec::new(),
            pre_break_volumes: HashMap::new(),
            is_ducked: false,
        }
    }

    pub fn is_config_valid(&self) -> bool {
        self.study_duration > 0 && self.break_duration > 0
    }

    pub fn start(&mut self) {
        if self.phase == TimerPhase::Idle && self.is_config_valid() {
            self.enter_studying();
        }
    }

    pub fn stop(&mut self, mut router: Option<&mut AudioRouter>) {
        if self.phase != TimerPhase::Idle {
            self.end_break(router.as_deref_mut(), false);
            self.phase = TimerPhase::Idle;
            self.deadline = None;
        }
    }

    pub fn skip(&mut self, mut router: Option<&mut AudioRouter>) {
        if self.phase == TimerPhase::Breaking || self.phase == TimerPhase::Warning {
            self.end_break(router.as_deref_mut(), true);
        }
    }

    pub fn snooze(&mut self) {
        if self.phase == TimerPhase::Warning {
            self.phase = TimerPhase::Studying;
            let snooze_sec = 5 * 60;
            self.deadline = Some(SystemTime::now() + Duration::from_secs(snooze_sec));
        }
    }

    pub fn set_durations(&mut self, study: u64, break_dur: u64) {
        self.study_duration = study.max(1);
        self.break_duration = break_dur.max(1);
    }

    pub fn remaining_seconds(&self) -> u64 {
        match self.deadline {
            Some(target) => {
                let now = SystemTime::now();
                if target > now {
                    target.duration_since(now).unwrap_or_default().as_secs()
                } else {
                    0
                }
            }
            None => 0,
        }
    }

    pub fn get_status(&self) -> TimerStatus {
        TimerStatus {
            phase: self.phase,
            remaining_seconds: self.remaining_seconds(),
            study_duration: self.study_duration,
            break_duration: self.break_duration,
            completed_sessions: self.completed_sessions_today,
            is_ducked: self.is_ducked,
        }
    }

    /// Advance the timer state machine by inspecting the wall-clock deadline.
    /// Returns Some(new_phase) if a transition occurred.
    pub fn tick(&mut self, router: Option<&mut AudioRouter>) -> Option<TimerPhase> {
        let remaining = self.remaining_seconds();

        match self.phase {
            TimerPhase::Studying => {
                if remaining <= self.warning_threshold {
                    self.phase = TimerPhase::Warning;
                    return Some(TimerPhase::Warning);
                }
            }
            TimerPhase::Warning => {
                if remaining == 0 {
                    self.enter_breaking(router);
                    return Some(TimerPhase::Breaking);
                }
            }
            TimerPhase::Breaking => {
                if remaining == 0 {
                    self.end_break(router, true);
                    return Some(self.phase);
                }
            }
            TimerPhase::Idle => {}
        }

        None
    }

    fn enter_studying(&mut self) {
        self.phase = TimerPhase::Studying;
        self.deadline = Some(SystemTime::now() + Duration::from_secs(self.study_duration));
    }

    fn enter_breaking(&mut self, router: Option<&mut AudioRouter>) {
        self.phase = TimerPhase::Breaking;
        self.deadline = Some(SystemTime::now() + Duration::from_secs(self.break_duration));

        // Duck audio during break (0.15 volume multiplier)
        if let Some(r) = router {
            self.pre_break_volumes = r.duck_all(0.15);
            self.is_ducked = true;
        }
    }

    fn end_break(&mut self, router: Option<&mut AudioRouter>, auto_loop: bool) {
        // Restore pre-break audio
        if self.is_ducked {
            if let Some(r) = router {
                r.restore_volumes(&self.pre_break_volumes);
            }
            self.pre_break_volumes.clear();
            self.is_ducked = false;
        }

        if auto_loop {
            self.completed_sessions_today += 1;
            self.enter_studying();
        } else {
            self.phase = TimerPhase::Idle;
            self.deadline = None;
        }
    }

    // MARK: - Todo Items Operations

    pub fn add_todo(&mut self, title: impl Into<String>) {
        self.add_todo_with_time(title, None, None, None);
    }

    pub fn add_todo_with_time(
        &mut self,
        title: impl Into<String>,
        start_time: Option<String>,
        end_time: Option<String>,
        duration_minutes: Option<u32>,
    ) {
        let clean = title.into().trim().to_string();
        if !clean.is_empty() {
            let seq = TODO_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let millis = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let id = format!("task-{millis}-{seq}");
            self.todo_items.push(TodoItem {
                id,
                title: clean,
                is_completed: false,
                start_time,
                end_time,
                duration_minutes,
            });
        }
    }

    pub fn toggle_todo(&mut self, id: &str) -> bool {
        if let Some(item) = self.todo_items.iter_mut().find(|it| it.id == id) {
            item.is_completed = !item.is_completed;
            true
        } else {
            false
        }
    }

    pub fn delete_todo(&mut self, id: &str) -> bool {
        let initial_len = self.todo_items.len();
        self.todo_items.retain(|it| it.id != id);
        self.todo_items.len() < initial_len
    }

    pub fn get_todos(&self) -> &[TodoItem] {
        &self.todo_items
    }

    #[doc(hidden)]
    pub fn set_deadline_for_test(&mut self, deadline: Option<SystemTime>) {
        self.deadline = deadline;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timer_initial_state() {
        let timer = BreakTimerManager::new(1500, 300);
        assert_eq!(timer.phase, TimerPhase::Idle);
        assert_eq!(timer.remaining_seconds(), 0);
        assert_eq!(timer.completed_sessions_today, 0);
        assert!(!timer.is_ducked);
    }

    #[test]
    fn test_timer_start_and_stop() {
        let mut timer = BreakTimerManager::new(100, 20);
        timer.start();
        assert_eq!(timer.phase, TimerPhase::Studying);
        assert!(timer.remaining_seconds() > 0 && timer.remaining_seconds() <= 100);

        timer.stop(None);
        assert_eq!(timer.phase, TimerPhase::Idle);
        assert_eq!(timer.remaining_seconds(), 0);
    }

    #[test]
    fn test_timer_warning_and_snooze() {
        let mut timer = BreakTimerManager::new(5, 2);
        timer.start();
        // Since duration is 5s, remaining <= warning_threshold (10s), tick moves to Warning
        let event = timer.tick(None);
        assert_eq!(event, Some(TimerPhase::Warning));
        assert_eq!(timer.phase, TimerPhase::Warning);

        timer.snooze();
        assert_eq!(timer.phase, TimerPhase::Studying);
        assert!(timer.remaining_seconds() > 290);
    }

    #[test]
    fn test_timer_audio_ducking_on_break() {
        let mut router = AudioRouter::new(48000.0);
        router.set_app_volume("com.spotify.client", 1.0);

        let mut timer = BreakTimerManager::new(1, 10);
        timer.start();

        // Simulate expiry to Warning
        timer.phase = TimerPhase::Warning;
        timer.deadline = Some(SystemTime::now() - Duration::from_millis(50));

        let event = timer.tick(Some(&mut router));
        assert_eq!(event, Some(TimerPhase::Breaking));
        assert_eq!(timer.phase, TimerPhase::Breaking);
        assert!(timer.is_ducked);

        // Verify audio is ducked to 0.15
        let ch = router.get_or_create_channel("com.spotify.client");
        assert!((ch.volume - 0.15).abs() < 1e-4);

        // Skip break -> triggers end_break with auto-loop
        timer.skip(Some(&mut router));
        assert_eq!(timer.phase, TimerPhase::Studying);
        assert_eq!(timer.completed_sessions_today, 1);
        assert!(!timer.is_ducked);

        // Verify volume restored to 1.0
        let ch_restored = router.get_or_create_channel("com.spotify.client");
        assert!((ch_restored.volume - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_todo_crud_operations() {
        let mut timer = BreakTimerManager::new(1500, 300);
        assert_eq!(timer.get_todos().len(), 0);

        timer.add_todo("Focus on Rust Audio Engine");
        assert_eq!(timer.get_todos().len(), 1);
        assert_eq!(timer.get_todos()[0].title, "Focus on Rust Audio Engine");
        assert!(!timer.get_todos()[0].is_completed);

        let id = timer.get_todos()[0].id.clone();
        timer.toggle_todo(&id);
        assert!(timer.get_todos()[0].is_completed);

        timer.delete_todo(&id);
        assert_eq!(timer.get_todos().len(), 0);
    }

    #[test]
    fn test_todo_with_timeboxing() {
        let mut timer = BreakTimerManager::new(25 * 60, 5 * 60);
        timer.add_todo_with_time(
            "Write Audio Driver",
            Some("14:00".to_string()),
            Some("14:50".to_string()),
            Some(50),
        );
        let todos = timer.get_todos();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].title, "Write Audio Driver");
        assert_eq!(todos[0].start_time.as_deref(), Some("14:00"));
        assert_eq!(todos[0].end_time.as_deref(), Some("14:50"));
        assert_eq!(todos[0].duration_minutes, Some(50));
    }
}
