//! The unattended half of the memory cleaner: a stored policy, a poll loop, and a log of
//! what every run actually did.
//!
//! The loop lives here rather than in the Tauri layer so the behaviour that matters —
//! when it fires, what it refuses to do on its own, what it writes down — is testable
//! without a desktop session. [`MemoryCleaner::tick`] is one full evaluate-and-maybe-run
//! step; the worker thread is nothing but that call on a timer.

use crate::memory::{
    self, AutoCleanDecision, AutoCleanPolicy, AutoCleanTrigger, MemoryCleanReport,
};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Enough history to see a pattern, few enough to stay a small file.
pub const HISTORY_LIMIT: usize = 50;
/// How often the worker re-evaluates. The policy's own cooldown decides whether anything
/// happens, so this only bounds how late a trigger can fire.
pub const POLL_INTERVAL: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryRunRecord {
    pub at_secs: u64,
    /// "manual", "interval" or "usage".
    pub trigger: String,
    pub freed_bytes: i64,
    pub used_percent_before: f64,
    pub used_percent_after: f64,
    pub areas_run: usize,
    pub areas_failed: usize,
    /// Why each area that did not work did not work. A run that reclaimed nothing has to
    /// say so here rather than just reporting zero bytes.
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryAutoStatus {
    pub policy: AutoCleanPolicy,
    /// What the scheduler would do right now, in the words the UI shows.
    pub decision: AutoCleanDecision,
    pub seconds_since_last_run: Option<u64>,
    pub history: Vec<MemoryRunRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct StoredState {
    #[serde(default)]
    policy: AutoCleanPolicy,
    #[serde(default)]
    history: Vec<MemoryRunRecord>,
}

pub struct MemoryCleaner {
    path: PathBuf,
    policy: Mutex<AutoCleanPolicy>,
    history: Mutex<VecDeque<MemoryRunRecord>>,
    last_run: Mutex<Option<Instant>>,
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl MemoryCleaner {
    /// Where the policy and the run log live, next to the app's other settings.
    pub fn default_config_path() -> PathBuf {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Path::new(&appdata).join("rust-sound").join("memory-cleaner.json");
        }
        if let Ok(home) = std::env::var("HOME") {
            return Path::new(&home)
                .join(".config")
                .join("rust-sound")
                .join("memory-cleaner.json");
        }
        PathBuf::from("memory-cleaner.json")
    }

    pub fn new(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let stored = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<StoredState>(&text).ok())
            .unwrap_or_default();
        let mut history: VecDeque<MemoryRunRecord> = stored.history.into_iter().collect();
        while history.len() > HISTORY_LIMIT {
            history.pop_front();
        }
        Self {
            path,
            // A policy read off disk went through an older build or a hand edit, so it is
            // sanitized before anything schedules against it.
            policy: Mutex::new(stored.policy.sanitized()),
            history: Mutex::new(history),
            last_run: Mutex::new(None),
            stop: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }

    pub fn policy(&self) -> AutoCleanPolicy {
        self.policy.lock().unwrap().clone()
    }

    /// Stores the sanitized form and returns it, so the UI shows what will actually run
    /// rather than what it asked for.
    pub fn set_policy(&self, policy: &AutoCleanPolicy) -> AutoCleanPolicy {
        let clean = policy.sanitized();
        *self.policy.lock().unwrap() = clean.clone();
        self.persist();
        clean
    }

    pub fn history(&self) -> Vec<MemoryRunRecord> {
        self.history.lock().unwrap().iter().rev().cloned().collect()
    }

    pub fn status(&self) -> MemoryAutoStatus {
        let policy = self.policy();
        let elapsed = self.since_last_run();
        MemoryAutoStatus {
            decision: memory::decide(&policy, &memory::snapshot(), elapsed),
            policy,
            seconds_since_last_run: elapsed.map(|d| d.as_secs()),
            history: self.history(),
        }
    }

    fn since_last_run(&self) -> Option<Duration> {
        self.last_run.lock().unwrap().map(|at| at.elapsed())
    }

    /// A run the user asked for. It may use areas the scheduler would not touch on its
    /// own, which is why `allow_prompt` is a parameter rather than a policy field.
    pub fn run_now(&self, area_ids: &[String], allow_prompt: bool) -> MemoryCleanReport {
        let report = memory::clean(area_ids, allow_prompt);
        self.record("manual", &report);
        report
    }

    /// One scheduler step. Returns what it decided, having already acted on it.
    pub fn tick(&self) -> AutoCleanDecision {
        let policy = self.policy();
        let snapshot = memory::snapshot();
        let decision = memory::decide(&policy, &snapshot, self.since_last_run());
        if let AutoCleanDecision::Run { trigger } = &decision {
            let label = match trigger {
                AutoCleanTrigger::Interval => "interval",
                AutoCleanTrigger::UsageAbove { .. } => "usage",
            };
            // Never interactive: an unattended run that puts a password dialog on screen
            // is worse than not reclaiming.
            let report = memory::clean(&policy.areas, false);
            self.record(label, &report);
        }
        decision
    }

    fn record(&self, trigger: &str, report: &MemoryCleanReport) {
        *self.last_run.lock().unwrap() = Some(Instant::now());
        let failed: Vec<&_> = report.outcomes.iter().filter(|o| !o.ok).collect();
        let record = MemoryRunRecord {
            at_secs: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            trigger: trigger.to_string(),
            freed_bytes: report.freed_bytes,
            used_percent_before: report.before.used_percent,
            used_percent_after: report.after.used_percent,
            areas_run: report.outcomes.len(),
            areas_failed: failed.len(),
            notes: failed
                .iter()
                .map(|o| format!("{}: {}", o.name, o.detail))
                .collect(),
        };
        {
            let mut history = self.history.lock().unwrap();
            history.push_back(record);
            while history.len() > HISTORY_LIMIT {
                history.pop_front();
            }
        }
        self.persist();
    }

    fn persist(&self) {
        let stored = StoredState {
            policy: self.policy(),
            history: self.history.lock().unwrap().iter().cloned().collect(),
        };
        let Ok(json) = serde_json::to_string_pretty(&stored) else {
            return;
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // Write and rename: a quit in the middle of a write would otherwise leave a
        // truncated file that reads back as "no policy at all" on the next launch.
        let temp = self.path.with_extension("json.tmp");
        if std::fs::write(&temp, &json).is_ok() && std::fs::rename(&temp, &self.path).is_err() {
            let _ = std::fs::remove_file(&temp);
            let _ = std::fs::write(&self.path, &json);
        }
    }

    pub fn start(self: &Arc<Self>) {
        let mut worker = self.worker.lock().unwrap();
        if worker.is_some() {
            return;
        }
        self.stop.store(false, Ordering::SeqCst);
        let cleaner = Arc::clone(self);
        let stop = Arc::clone(&self.stop);
        *worker = Some(std::thread::spawn(move || {
            while !stop.load(Ordering::Acquire) {
                // Sleep in slices so quitting does not wait out a whole interval.
                for _ in 0..(POLL_INTERVAL.as_millis() / 100) {
                    if stop.load(Ordering::Acquire) {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                if stop.load(Ordering::Acquire) {
                    return;
                }
                cleaner.tick();
            }
        }));
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.worker.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
}

impl Drop for MemoryCleaner {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::AREA_APP_WORKING_SET;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "memory-cleaner-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("memory-cleaner.json")
    }

    fn always_on() -> AutoCleanPolicy {
        AutoCleanPolicy {
            enabled: true,
            areas: vec![AREA_APP_WORKING_SET.into()],
            every_minutes: Some(1),
            when_used_percent_above: None,
            cooldown_minutes: 1,
        }
    }

    #[test]
    fn a_tick_runs_once_and_then_holds_until_the_cooldown_passes() {
        let path = temp_path("cooldown");
        let cleaner = MemoryCleaner::new(&path);
        cleaner.set_policy(&always_on());

        assert!(cleaner.tick().should_run(), "a fresh session is due");
        assert_eq!(cleaner.history().len(), 1);

        // The second tick lands inside the cooldown and must leave the log alone.
        match cleaner.tick() {
            AutoCleanDecision::Idle { reason } => assert!(reason.contains("Cooling down"), "{reason}"),
            other => panic!("expected a cooldown, got {other:?}"),
        }
        assert_eq!(cleaner.history().len(), 1, "a skipped tick is not a run");

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn an_unattended_run_never_uses_an_area_that_would_ask_for_a_password() {
        let path = temp_path("prompt");
        let cleaner = MemoryCleaner::new(&path);

        let prompting: Vec<String> = memory::areas()
            .into_iter()
            .filter(|a| a.prompts_for_credentials)
            .map(|a| a.id)
            .collect();
        let stored = cleaner.set_policy(&AutoCleanPolicy {
            enabled: true,
            areas: [vec![AREA_APP_WORKING_SET.to_string()], prompting.clone()].concat(),
            every_minutes: Some(1),
            when_used_percent_above: None,
            cooldown_minutes: 1,
        });
        for id in &prompting {
            assert!(
                !stored.areas.contains(id),
                "{id} prompts, so the scheduler must not keep it"
            );
        }
        assert!(cleaner.tick().should_run());

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_policy_and_the_run_log_survive_a_restart() {
        let path = temp_path("persist");
        {
            let cleaner = MemoryCleaner::new(&path);
            cleaner.set_policy(&AutoCleanPolicy {
                enabled: true,
                areas: vec![AREA_APP_WORKING_SET.into()],
                every_minutes: Some(45),
                when_used_percent_above: Some(70.0),
                cooldown_minutes: 7,
            });
            cleaner.run_now(&[AREA_APP_WORKING_SET.to_string()], false);
        }

        let reopened = MemoryCleaner::new(&path);
        let policy = reopened.policy();
        assert!(policy.enabled);
        assert_eq!(policy.every_minutes, Some(45));
        assert_eq!(policy.when_used_percent_above, Some(70.0));
        assert_eq!(policy.cooldown_minutes, 7);

        let history = reopened.history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].trigger, "manual");
        assert_eq!(history[0].areas_run, 1);

        // A restart has no in-process last-run time, so the interval is due again rather
        // than silently blocked by a cooldown nothing can observe.
        assert_eq!(reopened.status().seconds_since_last_run, None);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_corrupt_config_falls_back_to_defaults_instead_of_refusing_to_start() {
        let path = temp_path("corrupt");
        std::fs::write(&path, "{ this is not json").unwrap();

        let cleaner = MemoryCleaner::new(&path);
        assert_eq!(cleaner.policy(), AutoCleanPolicy::default().sanitized());
        assert!(cleaner.history().is_empty());

        // And it repairs the file rather than leaving the bad one in place.
        cleaner.set_policy(&always_on());
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(serde_json::from_str::<StoredState>(&text).is_ok());

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_history_is_newest_first_and_bounded() {
        let path = temp_path("bounded");
        let cleaner = MemoryCleaner::new(&path);
        for _ in 0..(HISTORY_LIMIT + 5) {
            cleaner.run_now(&[AREA_APP_WORKING_SET.to_string()], false);
        }
        let history = cleaner.history();
        assert_eq!(history.len(), HISTORY_LIMIT);
        assert!(
            history.first().unwrap().at_secs >= history.last().unwrap().at_secs,
            "newest first"
        );

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_failed_area_is_written_down_rather_than_counted_as_nothing() {
        let path = temp_path("notes");
        let cleaner = MemoryCleaner::new(&path);
        cleaner.run_now(&["not_a_real_area".to_string()], false);

        let record = &cleaner.history()[0];
        assert_eq!(record.areas_run, 1);
        assert_eq!(record.areas_failed, 1);
        assert_eq!(record.notes.len(), 1);
        assert!(record.notes[0].contains("Unknown memory area"), "{:?}", record.notes);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn the_worker_starts_once_and_stops_promptly() {
        let path = temp_path("worker");
        let cleaner = Arc::new(MemoryCleaner::new(&path));
        cleaner.start();
        cleaner.start(); // idempotent

        let began = Instant::now();
        cleaner.stop();
        assert!(
            began.elapsed() < Duration::from_secs(2),
            "stopping must not wait out a poll interval"
        );

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
