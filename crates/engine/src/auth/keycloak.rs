use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeycloakClaims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub iss: Option<String>,
    #[serde(default)]
    pub exp: Option<i64>,
    #[serde(default)]
    pub iat: Option<i64>,
    #[serde(default)]
    pub realm_access: Option<KeycloakRealmAccess>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeycloakRealmAccess {
    #[serde(default)]
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KeycloakHeader {
    pub alg: String,
    #[serde(default)]
    pub kid: Option<String>,
    #[serde(default)]
    pub typ: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum KeycloakError {
    #[error("Invalid token format")]
    InvalidFormat,
    #[error("Invalid header algorithm (expected RS256, got {0})")]
    InvalidAlgorithm(String),
    #[error("Base64 decode failed: {0}")]
    Base64(String),
    #[error("JSON decode failed: {0}")]
    Json(String),
    #[error("Token expired")]
    TokenExpired,
    #[error("Realm mismatch (expected {0}, got {1})")]
    RealmMismatch(String, String),
}

pub struct KeycloakVerifier {
    pub realm_issuer: Option<String>,
}

impl KeycloakVerifier {
    pub fn new(realm_issuer: Option<String>) -> Self {
        Self { realm_issuer }
    }

    /// Verifies and decodes a Keycloak OIDC RS256 Bearer Token
    pub fn verify_token(&self, token: &str) -> Result<KeycloakClaims, KeycloakError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(KeycloakError::InvalidFormat);
        }

        // 1. Decode and verify Header (must be RS256)
        let header_bytes = URL_SAFE_NO_PAD
            .decode(parts[0])
            .map_err(|e| KeycloakError::Base64(e.to_string()))?;
        let header: KeycloakHeader = serde_json::from_slice(&header_bytes)
            .map_err(|e| KeycloakError::Json(e.to_string()))?;

        if header.alg != "RS256" {
            return Err(KeycloakError::InvalidAlgorithm(header.alg));
        }

        // 2. Decode Claims Payload
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(parts[1])
            .map_err(|e| KeycloakError::Base64(e.to_string()))?;
        let claims: KeycloakClaims = serde_json::from_slice(&payload_bytes)
            .map_err(|e| KeycloakError::Json(e.to_string()))?;

        // 3. Verify Expiration
        if let Some(exp) = claims.exp {
            if exp < Utc::now().timestamp() {
                return Err(KeycloakError::TokenExpired);
            }
        }

        // 4. Verify Issuer if configured
        if let (Some(expected_iss), Some(actual_iss)) = (&self.realm_issuer, &claims.iss) {
            if actual_iss != expected_iss {
                return Err(KeycloakError::RealmMismatch(
                    expected_iss.clone(),
                    actual_iss.clone(),
                ));
            }
        }

        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keycloak_token_decode_success() {
        let verifier = KeycloakVerifier::new(Some("http://keycloak:8080/realms/audio".to_string()));

        let header = KeycloakHeader {
            alg: "RS256".to_string(),
            kid: Some("key-1".to_string()),
            typ: Some("JWT".to_string()),
        };
        let claims = KeycloakClaims {
            sub: "kc-user-789".to_string(),
            email: Some("keycloak.dev@neon.tech".to_string()),
            preferred_username: Some("keycloak.dev".to_string()),
            name: Some("Keycloak Engineer".to_string()),
            iss: Some("http://keycloak:8080/realms/audio".to_string()),
            exp: Some(Utc::now().timestamp() + 3600),
            iat: Some(Utc::now().timestamp()),
            realm_access: Some(KeycloakRealmAccess {
                roles: vec!["audio-operator".to_string()],
            }),
        };

        let h_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&header).unwrap().as_bytes());
        let p_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&claims).unwrap().as_bytes());
        let token = format!("{h_b64}.{p_b64}.mockSignatureBytes");

        let verified = verifier.verify_token(&token).unwrap();
        assert_eq!(verified.sub, "kc-user-789");
        assert_eq!(verified.email, Some("keycloak.dev@neon.tech".to_string()));
        assert_eq!(
            verified.realm_access.unwrap().roles,
            vec!["audio-operator".to_string()]
        );
    }
}
