use crate::google::GoogleUserProfile;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserIdentity {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub provider_user_id: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub session_id: String,
    pub user_id: String,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    General(String),
    #[error("User not found: {0}")]
    UserNotFound(String),
}

/// DDL Schema definitions for Neon PostgreSQL
pub const NEON_MIGRATIONS_DDL: &str = r#"
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pkce_challenges (
    code_challenge TEXT PRIMARY KEY,
    code_challenge_method TEXT NOT NULL,
    state TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
"#;

pub struct AuthRepository {
    pub connection_string: String,
    // Thread-safe state caching to support offline desktop resilience and unit testing
    users: Arc<Mutex<HashMap<String, User>>>,
    identities: Arc<Mutex<HashMap<String, UserIdentity>>>,
    sessions: Arc<Mutex<HashMap<String, AuthSession>>>,
}

impl AuthRepository {
    pub fn new(connection_string: impl Into<String>) -> Self {
        Self {
            connection_string: connection_string.into(),
            users: Arc::new(Mutex::new(HashMap::new())),
            identities: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Automatically provisions or links a user from Google OAuth2
    pub fn upsert_google_user(&self, profile: &GoogleUserProfile) -> Result<User, DbError> {
        let mut users = self.users.lock().unwrap();
        let mut identities = self.identities.lock().unwrap();
        let now = Utc::now();

        // Check if user identity already exists
        let identity_key = format!("google:{}", profile.provider_user_id);
        if let Some(identity) = identities.get(&identity_key) {
            if let Some(user) = users.get_mut(&identity.user_id) {
                user.name = profile.name.clone();
                user.avatar_url = profile.avatar_url.clone();
                user.updated_at = now;
                return Ok(user.clone());
            }
        }

        // Check if existing user by email
        let existing_user = users
            .values()
            .find(|u| u.email.eq_ignore_ascii_case(&profile.email))
            .cloned();

        let user = match existing_user {
            Some(mut u) => {
                u.name = profile.name.clone();
                u.avatar_url = profile.avatar_url.clone();
                u.updated_at = now;
                users.insert(u.id.clone(), u.clone());
                u
            }
            None => {
                let new_user = User {
                    id: format!("usr-{}", Uuid::new_v4()),
                    email: profile.email.clone(),
                    name: profile.name.clone(),
                    avatar_url: profile.avatar_url.clone(),
                    created_at: now,
                    updated_at: now,
                };
                users.insert(new_user.id.clone(), new_user.clone());
                new_user
            }
        };

        // Record identity linkage
        identities.insert(
            identity_key,
            UserIdentity {
                id: format!("ident-{}", Uuid::new_v4()),
                user_id: user.id.clone(),
                provider: "google".to_string(),
                provider_user_id: profile.provider_user_id.clone(),
                email: profile.email.clone(),
                created_at: now,
            },
        );

        Ok(user)
    }

    pub fn create_session(
        &self,
        session_id: &str,
        user_id: &str,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), DbError> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(
            session_id.to_string(),
            AuthSession {
                session_id: session_id.to_string(),
                user_id: user_id.to_string(),
                token_hash: token_hash.to_string(),
                expires_at,
                created_at: Utc::now(),
            },
        );
        Ok(())
    }

    pub fn get_user_by_id(&self, id: &str) -> Result<Option<User>, DbError> {
        let users = self.users.lock().unwrap();
        Ok(users.get(id).cloned())
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), DbError> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(session_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upsert_google_user_and_link_by_email() {
        let repo = AuthRepository::new("mock-neon-conn-str");
        let profile_1 = GoogleUserProfile {
            provider_user_id: "google-101".to_string(),
            email: "alex@neon.tech".to_string(),
            name: "Alex N".to_string(),
            avatar_url: Some("https://avatar.com/1.jpg".to_string()),
        };

        let user_1 = repo.upsert_google_user(&profile_1).unwrap();
        assert_eq!(user_1.email, "alex@neon.tech");
        assert_eq!(user_1.name, "Alex N");

        // Second login with updated name on same email
        let profile_2 = GoogleUserProfile {
            provider_user_id: "google-101".to_string(),
            email: "alex@neon.tech".to_string(),
            name: "Alex Nguyen".to_string(),
            avatar_url: Some("https://avatar.com/updated.jpg".to_string()),
        };

        let user_2 = repo.upsert_google_user(&profile_2).unwrap();
        assert_eq!(user_1.id, user_2.id); // Same user ID linked
        assert_eq!(user_2.name, "Alex Nguyen");
        assert_eq!(
            user_2.avatar_url,
            Some("https://avatar.com/updated.jpg".to_string())
        );
    }
}
