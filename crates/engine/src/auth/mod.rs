pub mod db;
pub mod dual_auth;
pub mod google;
pub mod jwt;
pub mod keycloak;
pub mod pkce;
pub mod remote;
pub mod loopback;

pub use db::{AuthRepository, AuthSession, DbError, User, UserIdentity, NEON_MIGRATIONS_DDL};
pub use dual_auth::{AuthenticatedUser, DualAuthError, DualAuthValidator};
pub use google::{GoogleAuthError, GoogleAuthVerifier, GoogleUserProfile};
pub use jwt::{JwtClaims, JwtError, JwtManager};
pub use keycloak::{KeycloakClaims, KeycloakError, KeycloakVerifier};
pub use pkce::{Pkce, PkceChallenge, PkceError};
pub use loopback::{bind_listener, wait_for_code};

use std::sync::Arc;
use uuid::Uuid;

pub struct AuthService {
    pub jwt: Arc<JwtManager>,
    pub google: GoogleAuthVerifier,
    pub keycloak: Arc<KeycloakVerifier>,
    pub dual_auth: DualAuthValidator,
    pub repo: Arc<AuthRepository>,
}

impl AuthService {
    pub fn new(jwt_secret: impl AsRef<[u8]>, neon_connection_string: impl Into<String>) -> Self {
        let jwt = Arc::new(JwtManager::new(jwt_secret));
        let keycloak = Arc::new(KeycloakVerifier::new(None));
        let dual_auth = DualAuthValidator::new(jwt.clone(), keycloak.clone());
        let repo = Arc::new(AuthRepository::new(neon_connection_string));
        let google = GoogleAuthVerifier::new(None);

        Self {
            jwt,
            google,
            keycloak,
            dual_auth,
            repo,
        }
    }

    /// Handles full Google Login flow: verifies Google ID token, upserts into Neon DB, and issues internal JWT
    pub fn handle_google_login(
        &self,
        id_token: &str,
    ) -> Result<(User, String), Box<dyn std::error::Error + Send + Sync>> {
        let profile = self.google.verify_id_token(id_token)?;
        let user = self.repo.upsert_google_user(&profile)?;

        let session_id = Uuid::new_v4().to_string();
        let claims = self.jwt.create_claims(&user.id, &session_id, &user.email, &user.name);
        let internal_token = self.jwt.sign(&claims)?;

        let expires_at = chrono::DateTime::from_timestamp(claims.exp, 0).unwrap_or_else(chrono::Utc::now);
        self.repo.create_session(&session_id, &user.id, &internal_token[..20], expires_at)?;

        Ok((user, internal_token))
    }
}
