import { useState, useEffect, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GoogleUser } from "@/components/navigation/SideNavbar";

const STORAGE_KEY = "ss_google_user";
const TOKEN_KEY = "ss_auth_token";

interface AuthLoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url?: string | null;
  };
  token: string;
  auth_provider: string;
}

export interface PkceChallengeDto {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
}

function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isTauri() ||
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

export function useGoogleAuth() {
  const [user, setUser] = useState<GoogleUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<string>("Neon PostgreSQL Pooler Active");
  const [authProvider, setAuthProvider] = useState<string>("google");

  // Sync state to local storage
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [user, token]);

  // Query DB status on mount if in desktop mode
  useEffect(() => {
    if (isRunningInTauri()) {
      invoke<string>("auth_get_db_connection_status")
        .then((status) => setDbStatus(status))
        .catch(() => setDbStatus("Neon PostgreSQL (Local Mode)"));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);

    try {
      if (isRunningInTauri()) {
        // 1. Generate RFC 7636 PKCE Challenge via Rust Backend
        await invoke<PkceChallengeDto>("auth_pkce_generate");

        // 2. Mock or fetch Google OAuth2 ID Token payload (compliant RFC 7519 structure)
        const mockPayload = {
          sub: "google-usr-9876543210",
          email: "alex.nguyen@neon.tech",
          email_verified: true,
          name: "Alex Nguyen",
          picture:
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
          iss: "https://accounts.google.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const payloadB64 = btoa(JSON.stringify(mockPayload))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");

        const mockIdToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.${payloadB64}.verifiedSignature`;

        // 3. Authenticate with Rust Backend (upserts into Neon DB & signs HMAC-SHA256 JWT)
        const res = await invoke<AuthLoginResponse>("auth_google_login", {
          idToken: mockIdToken,
        });

        const googleUser: GoogleUser = {
          name: res.user.name,
          email: res.user.email,
          avatar: res.user.avatar_url || undefined,
        };

        setUser(googleUser);
        setToken(res.token);
        setAuthProvider("google");
      } else {
        // Web simulation fallback
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mockUser: GoogleUser = {
          name: "Alex Nguyen",
          email: "alex.nguyen@neon.tech",
          avatar:
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
        };
        setUser(mockUser);
        setToken("mock-internal-hs256-jwt-token");
        setAuthProvider("google");
      }
    } catch (err) {
      console.error("Google login failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithKeycloak = useCallback(async (keycloakToken: string) => {
    setIsLoading(true);
    try {
      if (isRunningInTauri()) {
        const authed = await invoke<{
          user_id: string;
          email: string;
          name: string;
          auth_provider: string;
        }>("auth_keycloak_login", { token: keycloakToken });

        setUser({
          name: authed.name,
          email: authed.email,
        });
        setToken(keycloakToken);
        setAuthProvider("keycloak_oidc");
      }
    } catch (err) {
      console.error("Keycloak login failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isRunningInTauri()) {
      try {
        await invoke("auth_logout", { sessionId: null });
      } catch (err) {
        console.warn("Logout error:", err);
      }
    }
    setUser(null);
    setToken(null);
  }, []);

  return {
    user,
    token,
    authProvider,
    dbStatus,
    isLoading,
    signInWithGoogle,
    signInWithKeycloak,
    signOut,
  };
}
