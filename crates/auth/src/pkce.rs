use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    pub state: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PkceError {
    #[error("Invalid verifier length (must be between 43 and 128 characters)")]
    InvalidVerifierLength,
    #[error("Unsupported code challenge method: {0}")]
    UnsupportedMethod(String),
    #[error("Code verifier mismatch")]
    VerifierMismatch,
}

pub struct Pkce;

impl Pkce {
    /// Generates a compliant RFC 7636 PKCE Challenge with method S256
    pub fn generate_challenge() -> PkceChallenge {
        // High entropy 64-byte random verifier
        let random_bytes = Uuid::new_v4().as_bytes().to_vec();
        let random_bytes_2 = Uuid::new_v4().as_bytes().to_vec();
        let mut combined = Vec::with_capacity(32);
        combined.extend_from_slice(&random_bytes);
        combined.extend_from_slice(&random_bytes_2);

        let code_verifier = URL_SAFE_NO_PAD.encode(&combined);
        let code_challenge = Self::compute_s256_challenge(&code_verifier);
        let state = Uuid::new_v4().to_string();

        PkceChallenge {
            code_verifier,
            code_challenge,
            code_challenge_method: "S256".to_string(),
            state,
        }
    }

    /// Computes S256 code_challenge from code_verifier: BASE64URL(SHA256(ASCII(verifier)))
    pub fn compute_s256_challenge(code_verifier: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        URL_SAFE_NO_PAD.encode(hash)
    }

    /// Verifies code_verifier against stored code_challenge using constant-time comparison
    /// (Equiv to Go crypto/subtle.ConstantTimeCompare)
    pub fn verify(
        code_verifier: &str,
        code_challenge: &str,
        method: &str,
    ) -> Result<bool, PkceError> {
        // RFC 7636 Section 4.1: code_verifier length must be 43..=128
        if code_verifier.len() < 43 || code_verifier.len() > 128 {
            return Err(PkceError::InvalidVerifierLength);
        }

        if method != "S256" {
            return Err(PkceError::UnsupportedMethod(method.to_string()));
        }

        let computed_challenge = Self::compute_s256_challenge(code_verifier);

        // Constant-time comparison to prevent timing attacks
        let is_match = bool::from(computed_challenge.as_bytes().ct_eq(code_challenge.as_bytes()));

        if !is_match {
            return Err(PkceError::VerifierMismatch);
        }

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_generate_and_verify_success() {
        let pkce = Pkce::generate_challenge();
        assert!(pkce.code_verifier.len() >= 43 && pkce.code_verifier.len() <= 128);
        assert_eq!(pkce.code_challenge_method, "S256");
        assert!(!pkce.code_challenge.is_empty());
        assert!(!pkce.state.is_empty());

        let result = Pkce::verify(
            &pkce.code_verifier,
            &pkce.code_challenge,
            &pkce.code_challenge_method,
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);
    }

    #[test]
    fn test_pkce_rfc7636_test_vector() {
        // RFC 7636 Appendix B test vector
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let expected_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

        let computed = Pkce::compute_s256_challenge(verifier);
        assert_eq!(computed, expected_challenge);

        let verified = Pkce::verify(verifier, expected_challenge, "S256");
        assert!(verified.is_ok());
    }

    #[test]
    fn test_pkce_tampered_verifier_fails() {
        let pkce = Pkce::generate_challenge();
        let invalid_verifier = format!("{}x", &pkce.code_verifier[..pkce.code_verifier.len() - 1]);
        let verified = Pkce::verify(&invalid_verifier, &pkce.code_challenge, "S256");
        assert!(verified.is_err());
    }

    #[test]
    fn test_pkce_invalid_length_fails() {
        let short_verifier = "too-short";
        let verified = Pkce::verify(short_verifier, "any-challenge", "S256");
        match verified {
            Err(PkceError::InvalidVerifierLength) => (),
            other => panic!("Expected InvalidVerifierLength, got {:?}", other),
        }
    }
}
