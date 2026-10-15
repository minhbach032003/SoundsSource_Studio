use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ActivityTheme {
    #[default]
    Chef,
    Engineer,
    Wizard,
    Explorer,
    Scientist,
}

impl ActivityTheme {
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Chef => "Chef",
            Self::Engineer => "Engineer",
            Self::Wizard => "Wizard",
            Self::Explorer => "Explorer",
            Self::Scientist => "Scientist",
        }
    }

    pub fn icon_name(&self) -> &'static str {
        match self {
            Self::Chef => "utensils",
            Self::Engineer => "cpu",
            Self::Wizard => "sparkles",
            Self::Explorer => "compass",
            Self::Scientist => "flask-conical",
        }
    }

    fn reading_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Perusing…", "Leafing through…", "Absorbing…", "Studying…", "Browsing…"],
            Self::Engineer => &["Inspecting…", "Reviewing…", "Parsing…", "Auditing…", "Loading…"],
            Self::Wizard => &["Studying the scrolls…", "Deciphering…", "Consulting the tome…", "Peering within…"],
            Self::Explorer => &["Surveying…", "Mapping the terrain…", "Examining the site…", "Charting…"],
            Self::Scientist => &["Observing…", "Reviewing the data…", "Analyzing the sample…", "Examining…"],
        }
    }

    fn writing_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Cooking…", "Baking…", "Crafting…", "Whittling…", "Sculpting…", "Stitching…"],
            Self::Engineer => &["Refactoring…", "Implementing…", "Patching…", "Scaffolding…", "Committing…"],
            Self::Wizard => &["Inscribing…", "Enchanting…", "Weaving a spell…", "Scribing…"],
            Self::Explorer => &["Logging the expedition…", "Marking the map…", "Recording findings…", "Documenting…"],
            Self::Scientist => &["Synthesizing…", "Documenting findings…", "Writing the report…", "Formulating…"],
        }
    }

    fn running_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Brewing…", "Simmering…", "Stirring the pot…", "Running the numbers…"],
            Self::Engineer => &["Compiling…", "Building…", "Executing…", "Deploying…", "Running the pipeline…"],
            Self::Wizard => &["Casting…", "Invoking…", "Summoning…", "Channeling magic…"],
            Self::Explorer => &["Blazing a trail…", "Trekking…", "Venturing forth…", "Pushing on…"],
            Self::Scientist => &["Running the experiment…", "Executing the protocol…", "Testing the hypothesis…", "Processing…"],
        }
    }

    fn searching_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Foraging…", "Scouting…", "Hunting…", "Exploring…", "Investigating…"],
            Self::Engineer => &["Scanning…", "Grepping…", "Indexing…", "Tracing…", "Profiling…"],
            Self::Wizard => &["Divining…", "Scrying…", "Seeking…", "Gazing into the orb…"],
            Self::Explorer => &["Scouting ahead…", "Seeking passage…", "Exploring…", "Reconnoitering…"],
            Self::Scientist => &["Scanning the dataset…", "Cross-referencing…", "Searching for patterns…", "Correlating…"],
        }
    }

    fn delegating_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Delegating…", "Hatching a plan…", "Spawning help…", "Rounding up agents…"],
            Self::Engineer => &["Spawning a process…", "Forking…", "Dispatching…", "Queueing a job…"],
            Self::Wizard => &["Calling forth…", "Summoning a familiar…", "Conjuring help…"],
            Self::Explorer => &["Sending a scout…", "Dispatching a guide…", "Rallying the crew…"],
            Self::Scientist => &["Assigning to the lab…", "Tasking the team…", "Delegating to an assistant…"],
        }
    }

    fn thinking_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Photosynthesizing…", "Sprouting…", "Planning…", "Pondering…", "Germinating…", "Marinating…", "Noodling…"],
            Self::Engineer => &["Architecting…", "Designing…", "Calculating…", "Debugging…", "Optimizing…"],
            Self::Wizard => &["Meditating…", "Pondering the arcane…", "Consulting the stars…", "Prophesying…"],
            Self::Explorer => &["Plotting a course…", "Reading the stars…", "Studying the map…", "Planning the route…"],
            Self::Scientist => &["Hypothesizing…", "Theorizing…", "Modeling…", "Calculating…", "Reasoning…"],
        }
    }

    fn done_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["All done!", "Wrapped up!", "Delivered!", "Finished!", "Mission complete!"],
            Self::Engineer => &["Build complete!", "Shipped!", "Merged!", "All green!", "Tests passing!"],
            Self::Wizard => &["The spell is cast!", "It is done!", "Magic complete!", "Quest fulfilled!"],
            Self::Explorer => &["Base camp reached!", "Trail blazed!", "Discovery made!", "Expedition complete!"],
            Self::Scientist => &["Hypothesis confirmed!", "Results in!", "Experiment complete!", "Published!"],
        }
    }

    fn waiting_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Awaiting instructions…", "Standing by…", "Listening…"],
            Self::Engineer => &["Awaiting input…", "Blocked on dependency…", "Polling…"],
            Self::Wizard => &["Awaiting the omens…", "The stars are aligning…", "Patience, young apprentice…"],
            Self::Explorer => &["Awaiting the tide…", "Resting at camp…", "Holding position…"],
            Self::Scientist => &["Awaiting results…", "Incubating…", "Waiting for the reaction…"],
        }
    }

    fn skill_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Consulting the recipe…", "Checking the cookbook…", "Following the method…"],
            Self::Engineer => &["Reading the manual…", "Checking the docs…", "Loading the module…"],
            Self::Wizard => &["Consulting the scrolls…", "Channeling a skill…", "Reading the grimoire…"],
            Self::Explorer => &["Consulting the guide…", "Reading the field notes…", "Checking the compass…"],
            Self::Scientist => &["Consulting the protocol…", "Reviewing the literature…", "Checking the procedure…"],
        }
    }

    fn generic_phrases(&self) -> &'static [&'static str] {
        match self {
            Self::Chef => &["Working…", "Tinkering…", "Doing the thing…"],
            Self::Engineer => &["Processing…", "Running…", "Executing…"],
            Self::Wizard => &["Weaving…", "Working the magic…", "At work…"],
            Self::Explorer => &["Moving forward…", "Pressing on…", "On the trail…"],
            Self::Scientist => &["Analyzing…", "Processing…", "At work…"],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActivityCategory {
    Reading,
    Writing,
    Running,
    Searching,
    Delegating,
    Skill,
    Generic,
}

pub struct ActivityFormatter;

impl ActivityFormatter {
    pub fn format(
        event_name: &str,
        tool_name: Option<&str>,
        file_path: Option<&str>,
        explicit_message: Option<&str>,
        theme: ActivityTheme,
    ) -> String {
        if event_name == "Notification" {
            if let Some(msg) = explicit_message {
                let trimmed = msg.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }

        if event_name == "UserPromptSubmit" {
            return Self::pick(theme.thinking_phrases(), event_name).to_string();
        }

        if let Some(tool) = tool_name {
            if let Some(text) = Self::tool_activity(tool, file_path, theme) {
                return text;
            }
        }

        if let Some(msg) = explicit_message {
            let trimmed = msg.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        Self::pick(theme.generic_phrases(), event_name).to_string()
    }

    pub fn format_state(state: &str, theme: ActivityTheme) -> Option<String> {
        match state.to_ascii_lowercase().as_str() {
            "done" => Some(Self::pick(theme.done_phrases(), "state.done").to_string()),
            "waiting" => Some(Self::pick(theme.waiting_phrases(), "state.waiting").to_string()),
            _ => None,
        }
    }

    fn category_for_tool(tool_name: &str) -> ActivityCategory {
        let n = tool_name.to_ascii_lowercase();
        if n.contains("task") || n.contains("agent") {
            ActivityCategory::Delegating
        } else if n.contains("skill") {
            ActivityCategory::Skill
        } else if n.contains("search") || n.contains("grep") || n.contains("glob") || n.contains("find") || n.contains("list") || n.contains("fetch") {
            ActivityCategory::Searching
        } else if n.contains("run") || n.contains("shell") || n.contains("terminal") || n.contains("bash") || n.contains("exec") || n.contains("command") {
            ActivityCategory::Running
        } else if n.contains("edit") || n.contains("write") || n.contains("create") || n.contains("patch") || n.contains("delete") {
            ActivityCategory::Writing
        } else if n.contains("read") || n.contains("view") || n.contains("cat") {
            ActivityCategory::Reading
        } else {
            ActivityCategory::Generic
        }
    }

    fn extension_hint(cat: ActivityCategory, file_path: Option<&str>) -> Option<String> {
        let path = file_path?;
        let filename = path.split('/').last().unwrap_or(path);
        let ext = path.split('.').last().unwrap_or("").to_ascii_lowercase();

        let lang = match ext.as_str() {
            "rs" => "Rust",
            "ts" => "TypeScript",
            "tsx" => "React",
            "js" => "JavaScript",
            "jsx" => "React",
            "py" => "Python",
            "go" => "Go",
            "swift" => "Swift",
            "c" | "h" => "C",
            "cpp" | "cc" | "hpp" => "C++",
            "css" | "scss" => "CSS",
            "html" => "HTML",
            "json" | "yaml" | "yml" | "toml" => "config",
            "md" => "docs",
            "sh" | "zsh" | "bash" => "scripts",
            _ => "",
        };

        if lang.is_empty() {
            return Some(format!("Editing {filename}…"));
        }

        match cat {
            ActivityCategory::Writing => Some(format!("Refactoring {lang} ({filename})…")),
            ActivityCategory::Reading => Some(format!("Reading {lang} ({filename})…")),
            _ => Some(format!("Working on {filename}…")),
        }
    }

    fn tool_activity(tool_name: &str, file_path: Option<&str>, theme: ActivityTheme) -> Option<String> {
        let cat = Self::category_for_tool(tool_name);
        if let Some(hint) = Self::extension_hint(cat, file_path) {
            return Some(hint);
        }

        let phrases = match cat {
            ActivityCategory::Reading => theme.reading_phrases(),
            ActivityCategory::Writing => theme.writing_phrases(),
            ActivityCategory::Running => theme.running_phrases(),
            ActivityCategory::Searching => theme.searching_phrases(),
            ActivityCategory::Delegating => theme.delegating_phrases(),
            ActivityCategory::Skill => theme.skill_phrases(),
            ActivityCategory::Generic => theme.generic_phrases(),
        };

        Some(Self::pick(phrases, tool_name).to_string())
    }

    fn pick<'a>(phrases: &'a [&'a str], key: &str) -> &'a str {
        if phrases.is_empty() {
            return "Working…";
        }
        let mut hash: usize = 0;
        for b in key.bytes() {
            hash = hash.wrapping_mul(31).wrapping_add(b as usize);
        }
        phrases[hash % phrases.len()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_activity_formatter_extensions() {
        let text = ActivityFormatter::format(
            "PreToolUse",
            Some("edit_file"),
            Some("crates/app/src/lib.rs"),
            None,
            ActivityTheme::Engineer,
        );
        assert!(text.contains("Rust"));
        assert!(text.contains("lib.rs"));
    }

    #[test]
    fn test_activity_formatter_themes() {
        let chef_text = ActivityFormatter::format(
            "PreToolUse",
            Some("bash"),
            None,
            None,
            ActivityTheme::Chef,
        );
        let eng_text = ActivityFormatter::format(
            "PreToolUse",
            Some("bash"),
            None,
            None,
            ActivityTheme::Engineer,
        );
        assert_ne!(chef_text, eng_text);
    }
}
