#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BreakClockConfig {
    pub enabled: bool,
    pub work_interval_secs: u64,
    pub break_length_secs: u64,
    pub max_delta_secs: u64,
}

impl Default for BreakClockConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            work_interval_secs: 3000, // 50 mins
            break_length_secs: 300,   // 5 mins
            max_delta_secs: 60,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreakTickResult {
    None,
    BreakDue,
    BreakOver,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Working,
    Resting(i64),
}

pub struct BreakClock {
    phase: Phase,
    active_seconds: u64,
    absence_seconds: u64,
    last_tick: Option<i64>,
}

impl Default for BreakClock {
    fn default() -> Self {
        Self::new()
    }
}

impl BreakClock {
    pub fn new() -> Self {
        Self {
            phase: Phase::Working,
            active_seconds: 0,
            absence_seconds: 0,
            last_tick: None,
        }
    }

    pub fn reset(&mut self) {
        self.phase = Phase::Working;
        self.active_seconds = 0;
        self.absence_seconds = 0;
        self.last_tick = None;
    }

    pub fn tick(&mut self, now_ts: i64, is_present: bool, config: &BreakClockConfig) -> BreakTickResult {
        if !config.enabled {
            self.reset();
            return BreakTickResult::None;
        }

        let delta = self.last_tick.map(|t| (now_ts - t).max(0) as u64).unwrap_or(0);
        self.last_tick = Some(now_ts);

        // System sleep or long pause -> treat as break taken
        if delta > config.max_delta_secs {
            self.phase = Phase::Working;
            self.active_seconds = 0;
            self.absence_seconds = 0;
            return BreakTickResult::None;
        }

        match self.phase {
            Phase::Working => {
                if is_present {
                    self.active_seconds += delta;
                    self.absence_seconds = 0;
                    if self.active_seconds >= config.work_interval_secs {
                        self.phase = Phase::Resting(now_ts);
                        return BreakTickResult::BreakDue;
                    }
                } else {
                    self.absence_seconds += delta;
                    if self.absence_seconds >= config.break_length_secs {
                        self.active_seconds = 0;
                        self.absence_seconds = 0;
                    }
                }
                BreakTickResult::None
            }
            Phase::Resting(since) => {
                let rest_duration = (now_ts - since).max(0) as u64;
                if rest_duration >= config.break_length_secs {
                    self.phase = Phase::Working;
                    self.active_seconds = 0;
                    self.absence_seconds = 0;
                    BreakTickResult::BreakOver
                } else {
                    BreakTickResult::None
                }
            }
        }
    }

    pub fn active_seconds(&self) -> u64 {
        self.active_seconds
    }

    pub fn is_resting(&self) -> bool {
        matches!(self.phase, Phase::Resting(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_break_clock_advancement() {
        let mut clock = BreakClock::new();
        let config = BreakClockConfig {
            enabled: true,
            work_interval_secs: 10,
            break_length_secs: 4,
            max_delta_secs: 30,
        };

        // Advance 8 seconds of work
        let r1 = clock.tick(1000, true, &config);
        assert_eq!(r1, BreakTickResult::None);

        let r2 = clock.tick(1008, true, &config);
        assert_eq!(r2, BreakTickResult::None);
        assert_eq!(clock.active_seconds(), 8);

        // Advance 3 more seconds -> 11 seconds >= 10 -> BreakDue
        let r3 = clock.tick(1011, true, &config);
        assert_eq!(r3, BreakTickResult::BreakDue);
        assert!(clock.is_resting());

        // Rest 5 seconds -> BreakOver
        let r4 = clock.tick(1016, false, &config);
        assert_eq!(r4, BreakTickResult::BreakOver);
        assert!(!clock.is_resting());
    }
}
