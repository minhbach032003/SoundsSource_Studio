use crate::auth::jwt::{JwtError, JwtManager};
use crate::auth::keycloak::{KeycloakError, KeycloakVerifier};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub auth_provider: String, // "internal_jwt" or "keycloak_oidc"
    pub roles: Vec<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AlgInspectionHeader {
    pub alg: String,
}

#[derive(Debug, thiserror::Error)]
pub enum DualAuthError {
    #[error("Missing or malformed token")]
    MalformedToken,
    #[error("Internal JWT validation failed: {0}")]
    InternalJwt(#[from] JwtError),
    #[error("Keycloak validation failed: {0}")]
    Keycloak(#[from] KeycloakError),
    #[error("Unsupported token algorithm: {0}")]
    UnsupportedAlgorithm(String),
    #[error("Base64 decode header error: {0}")]
    Base64(String),
    #[error("JSON decode header error: {0}")]
    Json(String),
}

pub struct DualAuthValidator {
    pub jwt_manager: Arc<JwtManager>,
    pub keycloak_verifier: Arc<KeycloakVerifier>,
}

impl DualAuthValidator {
    pub fn new(jwt_manager: Arc<JwtManager>, keycloak_verifier: Arc<KeycloakVerifier>) -> Self {
        Self {
            jwt_manager,
            keycloak_verifier,
        }
    }

    /// Authenticates a token via Dual-Auth: accepts either Keycloak RS256 or internal HS256 JWT
    pub fn authenticate_token(&self, raw_token: &str) -> Result<AuthenticatedUser, DualAuthError> {
        let token = raw_token.strip_prefix("Bearer ").unwrap_or(raw_token).trim();

        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(DualAuthError::MalformedToken);
        }

        // Inspect header to detect algorithm
        let header_bytes = URL_SAFE_NO_PAD
            .decode(parts[0])
            .map_err(|e| DualAuthError::Base64(e.to_string()))?;
        let header: AlgInspectionHeader = serde_json::from_slice(&header_bytes)
            .map_err(|e| DualAuthError::Json(e.to_string()))?;

        match header.alg.as_str() {
            "HS256" => {
                let claims = self.jwt_manager.verify(token)?;
                Ok(AuthenticatedUser {
                    user_id: claims.sub,
                    email: claims.email,
                    name: claims.name,
                    auth_provider: "internal_jwt".to_string(),
                    roles: vec!["user".to_string()],
                    session_id: Some(claims.session_id),
                })
            }
            "RS256" => {
                let claims = self.keycloak_verifier.verify_token(token)?;
                let email = claims
                    .email
                    .or_else(|| claims.preferred_username.clone())
                    .unwrap_or_else(|| format!("{}@keycloak.local", claims.sub));
                let name = claims
                    .name
                    .or(claims.preferred_username)
                    .unwrap_or_else(|| "Keycloak User".to_string());
                let roles = claims
                    .realm_access
                    .map(|r| r.roles)
                    .unwrap_or_else(|| vec!["user".to_string()]);

                Ok(AuthenticatedUser {
                    user_id: claims.sub,
                    email,
                    name,
                    auth_provider: "keycloak_oidc".to_string(),
                    roles,
                    session_id: None,
                })
            }
            unsupported => Err(DualAuthError::UnsupportedAlgorithm(unsupported.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_dual_auth_internal_hs256_accepted() {
        let jwt_mgr = Arc::new(JwtManager::new("secret-key-dual-auth"));
        let kc_ver = Arc::new(KeycloakVerifier::new(None));
        let validator = DualAuthValidator::new(jwt_mgr.clone(), kc_ver);

        let claims = jwt_mgr.create_claims("user-hs256", "session-1", "user@internal.app", "Internal User");
        let token = jwt_mgr.sign(&claims).unwrap();

        let authed = validator.authenticate_token(&format!("Bearer {token}")).unwrap();
        assert_eq!(authed.user_id, "user-hs256");
        assert_eq!(authed.auth_provider, "internal_jwt");
        assert_eq!(authed.email, "user@internal.app");
    }

    #[test]
    fn test_dual_auth_keycloak_rs256_accepted() {
        let jwt_mgr = Arc::new(JwtManager::new("secret-key-dual-auth"));
        let kc_ver = Arc::new(KeycloakVerifier::new(None));
        let validator = DualAuthValidator::new(jwt_mgr, kc_ver);

        // Construct mock RS256 token header
        let header = serde_json::json!({ "alg": "RS256", "typ": "JWT" });
        let claims = serde_json::json!({
            "sub": "user-rs256-kc",
            "email": "keycloak@neon.tech",
            "name": "Keycloak Admin",
            "exp": Utc::now().timestamp() + 3600
        });

        let h_b64 = URL_SAFE_NO_PAD.encode(header.to_string().as_bytes());
        let p_b64 = URL_SAFE_NO_PAD.encode(claims.to_string().as_bytes());
        let token = format!("{h_b64}.{p_b64}.fakeSignatureForTest");

        let authed = validator.authenticate_token(&token).unwrap();
        assert_eq!(authed.user_id, "user-rs256-kc");
        assert_eq!(authed.auth_provider, "keycloak_oidc");
        assert_eq!(authed.email, "keycloak@neon.tech");
    }
}
