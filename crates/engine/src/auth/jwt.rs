use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct JwtClaims {
    pub sub: String,        // User ID
    pub session_id: String, // Session UUID
    pub exp: i64,           // Expiration unix timestamp
    pub iat: i64,           // Issued at unix timestamp
    pub email: String,      // User email
    pub name: String,       // User display name
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JwtHeader {
    alg: String,
    typ: String,
}

#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("Invalid token format")]
    InvalidFormat,
    #[error("Unsupported algorithm: {0}")]
    UnsupportedAlgorithm(String),
    #[error("Invalid signature")]
    InvalidSignature,
    #[error("Token expired")]
    TokenExpired,
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Base64 decoding error: {0}")]
    Base64(String),
}

pub struct JwtManager {
    secret: Vec<u8>,
    default_ttl_seconds: i64,
}

impl JwtManager {
    pub fn new(secret: impl AsRef<[u8]>) -> Self {
        Self {
            secret: secret.as_ref().to_vec(),
            default_ttl_seconds: 7 * 24 * 3600, // 7 days default session TTL
        }
    }

    pub fn with_ttl(secret: impl AsRef<[u8]>, ttl_seconds: i64) -> Self {
        Self {
            secret: secret.as_ref().to_vec(),
            default_ttl_seconds: ttl_seconds,
        }
    }

    pub fn create_claims(
        &self,
        sub: impl Into<String>,
        session_id: impl Into<String>,
        email: impl Into<String>,
        name: impl Into<String>,
    ) -> JwtClaims {
        let now = Utc::now().timestamp();
        JwtClaims {
            sub: sub.into(),
            session_id: session_id.into(),
            iat: now,
            exp: now + self.default_ttl_seconds,
            email: email.into(),
            name: name.into(),
        }
    }

    pub fn sign(&self, claims: &JwtClaims) -> Result<String, JwtError> {
        let header = JwtHeader {
            alg: "HS256".to_string(),
            typ: "JWT".to_string(),
        };

        let header_json = serde_json::to_string(&header)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;
        let payload_json = serde_json::to_string(claims)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;

        let header_b64 = URL_SAFE_NO_PAD.encode(header_json.as_bytes());
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload_json.as_bytes());

        let signing_input = format!("{header_b64}.{payload_b64}");

        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;
        mac.update(signing_input.as_bytes());
        let signature_bytes = mac.finalize().into_bytes();
        let signature_b64 = URL_SAFE_NO_PAD.encode(signature_bytes);

        Ok(format!("{signing_input}.{signature_b64}"))
    }

    pub fn verify(&self, token: &str) -> Result<JwtClaims, JwtError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(JwtError::InvalidFormat);
        }

        let (header_b64, payload_b64, signature_b64) = (parts[0], parts[1], parts[2]);

        // 1. Decode header
        let header_bytes = URL_SAFE_NO_PAD
            .decode(header_b64)
            .map_err(|e| JwtError::Base64(e.to_string()))?;
        let header: JwtHeader = serde_json::from_slice(&header_bytes)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;

        if header.alg != "HS256" {
            return Err(JwtError::UnsupportedAlgorithm(header.alg));
        }

        // 2. Verify signature with constant-time equality
        let signing_input = format!("{header_b64}.{payload_b64}");
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;
        mac.update(signing_input.as_bytes());
        let expected_signature = mac.finalize().into_bytes();

        let provided_signature = URL_SAFE_NO_PAD
            .decode(signature_b64)
            .map_err(|e| JwtError::Base64(e.to_string()))?;

        if !bool::from(expected_signature.as_slice().ct_eq(&provided_signature)) {
            return Err(JwtError::InvalidSignature);
        }

        // 3. Decode and validate claims
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|e| JwtError::Base64(e.to_string()))?;
        let claims: JwtClaims = serde_json::from_slice(&payload_bytes)
            .map_err(|e| JwtError::Serialization(e.to_string()))?;

        // 4. Validate expiration
        let now = Utc::now().timestamp();
        if claims.exp < now {
            return Err(JwtError::TokenExpired);
        }

        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_sign_and_verify_success() {
        let jwt = JwtManager::new("super-secret-auth-key-12345");
        let claims = jwt.create_claims("usr-1", "sess-1", "alex@neon.tech", "Alex Nguyen");

        let token = jwt.sign(&claims).unwrap();
        assert_eq!(token.split('.').count(), 3);

        let verified = jwt.verify(&token).unwrap();
        assert_eq!(verified.sub, "usr-1");
        assert_eq!(verified.session_id, "sess-1");
        assert_eq!(verified.email, "alex@neon.tech");
        assert_eq!(verified.name, "Alex Nguyen");
        assert!(verified.exp > Utc::now().timestamp());
    }

    #[test]
    fn test_jwt_tampered_signature_fails() {
        let jwt = JwtManager::new("super-secret-auth-key-12345");
        let claims = jwt.create_claims("usr-1", "sess-1", "alex@neon.tech", "Alex Nguyen");

        let token = jwt.sign(&claims).unwrap();
        let tampered = format!("{}tampered", token);
        assert!(jwt.verify(&tampered).is_err());
    }

    #[test]
    fn test_jwt_expired_token_fails() {
        let jwt = JwtManager::with_ttl("super-secret-key", -10); // already expired
        let claims = jwt.create_claims("usr-1", "sess-1", "alex@neon.tech", "Alex Nguyen");

        let token = jwt.sign(&claims).unwrap();
        match jwt.verify(&token) {
            Err(JwtError::TokenExpired) => (),
            other => panic!("Expected TokenExpired error, got {:?}", other),
        }
    }
}
