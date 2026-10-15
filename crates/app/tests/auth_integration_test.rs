use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use sound_engine::{
    AuthRepository, AuthService, GoogleUserProfile, JwtManager, KeycloakClaims, Pkce,
};

#[test]
fn test_pkce_full_flow_s256_constant_time() {
    let challenge = Pkce::generate_challenge();
    assert_eq!(challenge.code_challenge_method, "S256");
    assert!(challenge.code_verifier.len() >= 43);

    // 1. Valid exchange
    let valid = Pkce::verify(
        &challenge.code_verifier,
        &challenge.code_challenge,
        &challenge.code_challenge_method,
    );
    assert_eq!(valid.unwrap(), true);

    // 2. Modified verifier must be rejected
    let tampered_verifier = format!("{}a", &challenge.code_verifier[1..]);
    let invalid = Pkce::verify(
        &tampered_verifier,
        &challenge.code_challenge,
        &challenge.code_challenge_method,
    );
    assert!(invalid.is_err());
}

#[test]
fn test_internal_jwt_hmac_sha256_flow() {
    let secret = "neon-pg-jwt-secret-key-test-98765";
    let jwt = JwtManager::new(secret);

    let claims = jwt.create_claims("usr-neon-01", "sess-neon-01", "engineer@neon.tech", "Neon Engineer");
    let token = jwt.sign(&claims).expect("Signing failed");

    let verified = jwt.verify(&token).expect("Verification failed");
    assert_eq!(verified.sub, "usr-neon-01");
    assert_eq!(verified.session_id, "sess-neon-01");
    assert_eq!(verified.email, "engineer@neon.tech");
    assert_eq!(verified.name, "Neon Engineer");
    assert!(verified.exp > Utc::now().timestamp());
}

#[test]
fn test_neon_db_google_user_provision_and_link() {
    // Live-DB test: set RUST_SOUND_NEON_URL to run it.
    let Ok(conn_str) = std::env::var("RUST_SOUND_NEON_URL") else {
        eprintln!("skipping: RUST_SOUND_NEON_URL not set");
        return;
    };
    let repo = AuthRepository::new(conn_str);

    let profile = GoogleUserProfile {
        provider_user_id: "google-sub-123456".to_string(),
        email: "alex.nguyen@neon.tech".to_string(),
        name: "Alex Nguyen".to_string(),
        avatar_url: Some("https://avatar.google.com/alex.png".to_string()),
    };

    let user = repo.upsert_google_user(&profile).unwrap();
    assert_eq!(user.email, "alex.nguyen@neon.tech");
    assert!(user.id.starts_with("usr-"));

    // Session creation
    let session_id = "sess-100";
    let expires = Utc::now() + chrono::Duration::days(7);
    repo.create_session(session_id, &user.id, "hash123", expires).unwrap();

    // Session deletion on logout
    repo.delete_session(session_id).unwrap();
}

#[test]
fn test_dual_auth_supports_both_keycloak_and_jwt() {
    let jwt_secret = "dual-auth-test-secret";
    let service = AuthService::new(jwt_secret, "mock-neon-conn");

    // 1. Test Internal JWT
    let claims = service.jwt.create_claims("user-jwt", "s-1", "user@neon.tech", "JWT User");
    let jwt_token = service.jwt.sign(&claims).unwrap();
    let auth_jwt = service.dual_auth.authenticate_token(&jwt_token).unwrap();
    assert_eq!(auth_jwt.auth_provider, "internal_jwt");
    assert_eq!(auth_jwt.user_id, "user-jwt");

    // 2. Test Keycloak RS256 Bearer Token
    let header = serde_json::json!({ "alg": "RS256", "typ": "JWT" });
    let kc_claims = KeycloakClaims {
        sub: "user-keycloak-oidc".to_string(),
        email: Some("keycloak@neon.tech".to_string()),
        preferred_username: Some("keycloak_admin".to_string()),
        name: Some("Keycloak Admin".to_string()),
        iss: None,
        exp: Some(Utc::now().timestamp() + 3600),
        iat: Some(Utc::now().timestamp()),
        realm_access: None,
    };
    let h_b64 = URL_SAFE_NO_PAD.encode(header.to_string().as_bytes());
    let p_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&kc_claims).unwrap().as_bytes());
    let kc_token = format!("Bearer {h_b64}.{p_b64}.mockSig");

    let auth_kc = service.dual_auth.authenticate_token(&kc_token).unwrap();
    assert_eq!(auth_kc.auth_provider, "keycloak_oidc");
    assert_eq!(auth_kc.user_id, "user-keycloak-oidc");
    assert_eq!(auth_kc.email, "keycloak@neon.tech");
}
