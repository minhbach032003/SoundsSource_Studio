import { invoke, isTauri } from "@tauri-apps/api/core";

export type SigningKind = "certificate" | "ad_hoc" | "unsigned" | "unknown";

export interface SigningIdentity {
  kind: SigningKind;
  authority: string | null;
  /** True when macOS will forget this app's permissions after the next rebuild. */
  permissions_reset_on_rebuild: boolean;
  explanation: string;
}

let cached: SigningIdentity | null = null;

/**
 * How macOS identifies this build. An ad-hoc signature is keyed to the exact binary, so
 * a rebuilt app is a new app as far as Screen Recording is concerned — which is why a
 * permission that was granted keeps being asked for again.
 */
export async function getSigningIdentity(): Promise<SigningIdentity> {
  if (cached) return cached;
  if (!isTauri()) {
    cached = {
      kind: "unknown",
      authority: null,
      permissions_reset_on_rebuild: false,
      explanation: "Running in a browser; macOS permissions do not apply.",
    };
    return cached;
  }
  try {
    cached = await invoke<SigningIdentity>("app_signing_identity");
  } catch {
    cached = {
      kind: "unknown",
      authority: null,
      permissions_reset_on_rebuild: false,
      explanation: "Could not read this build's signing identity.",
    };
  }
  return cached;
}

/** One line telling the user how to stop the permission resetting, or null if it will not. */
export function rebuildPermissionHint(identity: SigningIdentity | null): string | null {
  if (!identity?.permissions_reset_on_rebuild) return null;
  return "Run ./scripts/macos-signing-identity.sh once, then rebuild. The app will be signed with a stable identity and macOS will keep the permission.";
}
