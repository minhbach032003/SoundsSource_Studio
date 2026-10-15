pub struct QuestionDetector;

impl QuestionDetector {
    const QUESTION_STARTERS: &'static [&'static str] = &[
        "which ", "what ", "how ", "should i", "do you", "want me to",
        "shall i", "would you", "can you", "could you", "are you",
        "is there", "would it", "could we", "should we", "where should",
    ];

    const OPTIONAL_FOLLOW_UPS: &'static [&'static str] = &[
        "let me know if",
        "let me know when",
        "feel free to",
        "if you'd like any",
        "if you want any",
        "if you want to",
        "if you'd like to",
        "if you need any",
        "say which one",
        "say the word",
        "if anything else",
        "happy to help",
        "happy to make",
        "don't hesitate",
        "just let me know",
        "let me know what you think",
    ];

    /// Returns `true` if the last sentence of `text` is a direct question or prompt for user decision.
    pub fn looks_like_question(text: &str) -> bool {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return false;
        }

        let last = Self::last_sentence(trimmed).to_ascii_lowercase();
        if last.is_empty() {
            return false;
        }

        if Self::is_optional_follow_up(&last) {
            return false;
        }

        Self::is_primary_question(&last)
    }

    fn last_sentence(text: &str) -> String {
        let normalized = text.replace('\n', " ");
        let mut segments: Vec<String> = Vec::new();
        let mut current = String::new();

        for c in normalized.chars() {
            current.push(c);
            if c == '.' || c == '!' || c == '?' {
                let s = current.trim().to_string();
                if !s.is_empty() {
                    segments.push(s);
                }
                current.clear();
            }
        }

        let remainder = current.trim().to_string();
        if !remainder.is_empty() {
            segments.push(remainder);
        }

        segments.pop().unwrap_or_else(|| text.to_string())
    }

    fn is_optional_follow_up(sentence: &str) -> bool {
        Self::OPTIONAL_FOLLOW_UPS
            .iter()
            .any(|pat| sentence.contains(pat))
    }

    fn is_primary_question(sentence: &str) -> bool {
        if sentence.ends_with('?') {
            return true;
        }

        let trimmed = sentence.trim_start_matches(|c: char| !c.is_alphanumeric());
        Self::QUESTION_STARTERS
            .iter()
            .any(|starter| trimmed.starts_with(starter))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_question_detection() {
        assert!(QuestionDetector::looks_like_question("I finished the changes. Should I run the test suite now?"));
        assert!(QuestionDetector::looks_like_question("Do you want me to commit these files?"));
        assert!(QuestionDetector::looks_like_question("Which option do you prefer?"));
    }

    #[test]
    fn test_polite_follow_up_not_question() {
        assert!(!QuestionDetector::looks_like_question("I completed the refactor. Let me know if you need anything else."));
        assert!(!QuestionDetector::looks_like_question("All tests are passing! Feel free to ask more questions."));
        assert!(!QuestionDetector::looks_like_question("Done with the task. Happy to help!"));
    }
}
