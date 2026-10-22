import { INSTALLED_PETS, type PetArchetype } from "../components/pet/types.ts";

const STORAGE_KEY_PREFIX = "rust_sound_project_pet_";
const SESSION_PET_PREFIX = "rust_sound_session_pet_";
export const FAVORITE_PETS_KEY = "rust_sound_favorite_pets";
export const DELETED_PETS_KEY = "rust_sound_deleted_pets";

export const DEFAULT_FAVORITE_PETS = [
  "super-saiyan-goku",
  "work-blue-cat",
  "boba",
] as const;

/** Get list of pet IDs hidden/deleted by the user */
export function getDeletedPetIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DELETED_PETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string" && INSTALLED_PETS.some((p) => p.id === id));
      }
    }
  } catch {}
  return [];
}

/** Get user's active, non-deleted pet archetypes */
export function getActivePets(): PetArchetype[] {
  const deleted = getDeletedPetIds();
  const active = INSTALLED_PETS.filter((p) => !deleted.includes(p.id));
  return active.length > 0 ? active : [INSTALLED_PETS[0]!];
}

/** Delete / hide a pet from the active roster. Returns false if attempting to delete the last pet. */
export function deletePet(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const active = getActivePets();
  if (active.length <= 1) {
    return false;
  }
  if (!active.some((p) => p.id === id)) {
    return false;
  }
  const deleted = Array.from(new Set([...getDeletedPetIds(), id]));
  localStorage.setItem(DELETED_PETS_KEY, JSON.stringify(deleted));

  // Sanitize favorite pets if deleted pet was assigned
  const remainingActive = INSTALLED_PETS.filter((p) => !deleted.includes(p.id));
  const fallbackPet = remainingActive[0]?.id || "code-frenzy-cat";
  const currentFavorites = getFavoritePets();
  if (currentFavorites.includes(id)) {
    const updatedFavorites = currentFavorites.map((f) => (f === id ? fallbackPet : f));
    setFavoritePets(updatedFavorites);
  }

  // Update equipped slug if deleted
  const currentSlug = localStorage.getItem("rust_sound_pet_slug");
  if (currentSlug === id) {
    localStorage.setItem("rust_sound_pet_slug", fallbackPet);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("deleted-pets-changed", { detail: { id, deleted } }));
    window.dispatchEvent(new Event("storage"));
  }
  return true;
}

/** Restore a previously deleted pet */
export function restorePet(id: string): void {
  if (typeof localStorage === "undefined") return;
  const deleted = getDeletedPetIds().filter((d) => d !== id);
  localStorage.setItem(DELETED_PETS_KEY, JSON.stringify(deleted));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("deleted-pets-changed", { detail: { restored: id, deleted } }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Restore all deleted pets to the active roster */
export function restoreAllPets(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(DELETED_PETS_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("deleted-pets-changed", { detail: { deleted: [] } }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Extract clean short project name from path (e.g. "/Users/mac/Documents/Ui/ClaimsUI" -> "ClaimsUI") */
export function getProjectName(projectPath?: string | null): string {
  if (!projectPath) return "workspace";
  const parts = projectPath.split("/").filter(Boolean);
  return parts.pop() || "workspace";
}

/** Get user-configured pet for a specific session ID */
export function getSessionPetBinding(sessionId?: string | null): string | null {
  if (!sessionId || typeof localStorage === "undefined") return null;
  return localStorage.getItem(`${SESSION_PET_PREFIX}${sessionId}`) || null;
}

/** Save user-configured pet for a specific session ID */
export function setSessionPetBinding(sessionId: string, petId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${SESSION_PET_PREFIX}${sessionId}`, petId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("session-pet-changed", { detail: { sessionId, petId } }));
    window.dispatchEvent(new CustomEvent("project-pet-changed", { detail: { sessionId, petId } }));
    window.dispatchEvent(new StorageEvent("storage", { key: `${SESSION_PET_PREFIX}${sessionId}` }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Get user-configured pet for a given project name */
export function getProjectPetBinding(projectName: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectName}`) || null;
}

/** Save user-configured pet for a given project name */
export function setProjectPetBinding(projectName: string, petId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectName}`, petId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("project-pet-changed", { detail: { projectName, petId } }));
    window.dispatchEvent(new StorageEvent("storage", { key: `${STORAGE_KEY_PREFIX}${projectName}` }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Look up archetype by ID, with fallback */
export function getPetArchetype(id?: string | null): PetArchetype {
  const active = getActivePets();
  return active.find((p) => p.id === id) || INSTALLED_PETS.find((p) => p.id === id) || active[0] || INSTALLED_PETS[0]!;
}

/** Get the user's active 3 favorite companions for desktop split clustering */
export function getFavoritePets(): string[] {
  if (typeof localStorage === "undefined") {
    return [...DEFAULT_FAVORITE_PETS];
  }
  try {
    const raw = localStorage.getItem(FAVORITE_PETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed.slice(0, 3).map((id) => (INSTALLED_PETS.some((p) => p.id === id) ? id : "work-blue-cat"));
      }
    }
  } catch {}
  return [...DEFAULT_FAVORITE_PETS];
}

/** Set favorite pets roster (Slot 0, Slot 1, Slot 2) */
export function setFavoritePets(trio: string[]): void {
  if (typeof localStorage === "undefined") return;
  const sanitized = trio.slice(0, 3).map((id) => (INSTALLED_PETS.some((p) => p.id === id) ? id : "work-blue-cat"));
  while (sanitized.length < 3) {
    sanitized.push(INSTALLED_PETS[sanitized.length]?.id || "work-blue-cat");
  }
  localStorage.setItem(FAVORITE_PETS_KEY, JSON.stringify(sanitized));
  // Keep primary slug in sync with Slot 0
  if (sanitized[0]) {
    localStorage.setItem("rust_sound_pet_slug", sanitized[0]);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("favorite-pets-changed", { detail: sanitized }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Update a single slot in the favorites roster (0: Primary, 1: Subagent 1, 2: Subagent 2) */
export function setFavoritePetSlot(slotIndex: number, petId: string): void {
  const current = getFavoritePets();
  const clampedIndex = Math.min(Math.max(slotIndex, 0), 2);
  current[clampedIndex] = petId;
  setFavoritePets(current);
}

/**
 * Maps an agent session to its distinct PetArchetype.
 * Priority:
 * 1. User's explicit session-level binding (when changed directly on that session row)
 * 2. User's explicit project binding (if set in Connected Sessions)
 * 3. Favorite trio by slot index (Slot 0 = Primary, Slot 1 = Subagent 1, Slot 2 = Subagent 2)
 * 4. Fallback to equipped pet or deterministic fallback
 */
export function getPetForSession(
  session: { project?: string | null; agent_kind?: string; id?: string } | null | undefined,
  index: number = 0,
  equippedSlug: string = "super-saiyan-goku"
): PetArchetype {
  if (session?.id) {
    const sessionExplicit = getSessionPetBinding(session.id);
    if (sessionExplicit) {
      return getPetArchetype(sessionExplicit);
    }
  }

  const projectName = getProjectName(session?.project);
  const explicit = getProjectPetBinding(projectName);
  if (explicit) {
    return getPetArchetype(explicit);
  }

  const favorites = getFavoritePets();
  if (index >= 0 && index < favorites.length && favorites[index]) {
    return getPetArchetype(favorites[index]);
  }

  // Fallback to equipped pet or unique roster pick
  if (index === 0) {
    return getPetArchetype(equippedSlug);
  }

  const otherPets = getActivePets().filter((p) => p.id !== equippedSlug);
  return otherPets[(index - 1) % otherPets.length] || getActivePets()[0] || INSTALLED_PETS[0]!;
}
