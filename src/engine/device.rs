use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: u32,
    pub name: String,
    pub uid: String,
    pub is_default: bool,
}

impl AudioDevice {
    pub fn new(id: u32, name: impl Into<String>, uid: impl Into<String>, is_default: bool) -> Self {
        Self {
            id,
            name: name.into(),
            uid: uid.into(),
            is_default,
        }
    }
}
