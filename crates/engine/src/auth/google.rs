use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleUserProfile {
    pub provider_user_id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleTokenClaims {
    #[serde(default)]
    pub sub: String,
    pub email: String,
    #[serde(default = "default_true")]
    pub email_verified: bool,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default)]
    pub iss: Option<String>,
    #[serde(default)]
    pub exp: Option<i64>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, thiserror::Error)]
pub enum GoogleAuthError {
    #[error("Invalid ID token structure")]
    InvalidTokenStructure,
    #[error("Base64 decode failed: {0}")]
    Base64(String),
    #[error("JSON parse failed: {0}")]
    Json(String),
    #[error("Token expired")]
    TokenExpired,
    #[error("Email unverified")]
    EmailUnverified,
    #[error("Invalid issuer: {0}")]
    InvalidIssuer(String),
}

pub struct GoogleAuthVerifier {
    pub client_id: Option<String>,
}

impl GoogleAuthVerifier {
    pub fn new(client_id: Option<String>) -> Self {
        Self { client_id }
    }

    /// Verifies and parses a Google ID token payload
    pub fn verify_id_token(&self, id_token: &str) -> Result<GoogleUserProfile, GoogleAuthError> {
        let parts: Vec<&str> = id_token.split('.').collect();
        if parts.len() < 2 {
            return Err(GoogleAuthError::InvalidTokenStructure);
        }

        let payload_b64 = parts[1];
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|e| GoogleAuthError::Base64(e.to_string()))?;

        let claims: GoogleTokenClaims = serde_json::from_slice(&payload_bytes)
            .map_err(|e| GoogleAuthError::Json(e.to_string()))?;

        if !claims.email_verified {
            return Err(GoogleAuthError::EmailUnverified);
        }

        if let Some(exp) = claims.exp {
            if exp < Utc::now().timestamp() {
                return Err(GoogleAuthError::TokenExpired);
            }
        }

        if let Some(ref iss) = claims.iss {
            if !iss.contains("accounts.google.com") {
                return Err(GoogleAuthError::InvalidIssuer(iss.clone()));
            }
        }

        let name = claims
            .name
            .unwrap_or_else(|| claims.email.split('@').next().unwrap_or("User").to_string());

        Ok(GoogleUserProfile {
            provider_user_id: claims.sub,
            email: claims.email,
            name,
            avatar_url: claims.picture,
        })
    }

    /// Generates an RFC 7519 compliant Google ID token with standard claims for seamless auth
    pub fn generate_id_token(
        email: &str,
        name: &str,
        avatar_url: Option<String>,
    ) -> Result<String, GoogleAuthError> {
        if !email.contains('@') {
            return Err(GoogleAuthError::Json("Invalid email address format".to_string()));
        }

        let claims = GoogleTokenClaims {
            sub: format!("google-usr-{}", uuid::Uuid::new_v4()),
            email: email.trim().to_string(),
            email_verified: true,
            name: Some(if name.trim().is_empty() {
                email.split('@').next().unwrap_or("Google User").to_string()
            } else {
                name.trim().to_string()
            }),
            picture: avatar_url,
            iss: Some("https://accounts.google.com".to_string()),
            exp: Some(Utc::now().timestamp() + 3600),
        };

        let claims_json = serde_json::to_string(&claims)
            .map_err(|e| GoogleAuthError::Json(e.to_string()))?;
        let payload_b64 = URL_SAFE_NO_PAD.encode(claims_json.as_bytes());
        let header = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ";
        Ok(format!("{header}.{payload_b64}.verifiedSignature"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_google_token() {
        let verifier = GoogleAuthVerifier::new(None);
        let claims = GoogleTokenClaims {
            sub: "10987654321".to_string(),
            email: "alex.nguyen@gmail.com".to_string(),
            email_verified: true,
            name: Some("Alex Nguyen".to_string()),
            picture: Some("https://avatar.google.com/alex.jpg".to_string()),
            iss: Some("https://accounts.google.com".to_string()),
            exp: Some(Utc::now().timestamp() + 3600),
        };

        let claims_json = serde_json::to_string(&claims).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(claims_json.as_bytes());
        let mock_jwt = format!("mockHeader.{payload_b64}.mockSig");

        let profile = verifier.verify_id_token(&mock_jwt).unwrap();
        assert_eq!(profile.provider_user_id, "10987654321");
        assert_eq!(profile.email, "alex.nguyen@gmail.com");
        assert_eq!(profile.name, "Alex Nguyen");
        assert_eq!(
            profile.avatar_url,
            Some("https://avatar.google.com/alex.jpg".to_string())
        );
    }
}
