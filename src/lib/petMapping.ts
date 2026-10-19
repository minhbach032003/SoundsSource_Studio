import { INSTALLED_PETS, type PetArchetype } from "../components/pet/types.ts";

const STORAGE_KEY_PREFIX = "rust_sound_project_pet_";
export const FAVORITE_PETS_KEY = "rust_sound_favorite_pets";

export const DEFAULT_FAVORITE_PETS = [
  "super-saiyan-goku",
  "work-blue-cat",
  "boba",
] as const;

/** Extract clean short project name from path (e.g. "/Users/mac/Documents/Ui/ClaimsUI" -> "ClaimsUI") */
export function getProjectName(projectPath?: string | null): string {
  if (!projectPath) return "workspace";
  const parts = projectPath.split("/").filter(Boolean);
  return parts.pop() || "workspace";
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
    window.dispatchEvent(new Event("storage"));
  }
}

/** Look up archetype by ID, with fallback */
export function getPetArchetype(id?: string | null): PetArchetype {
  return INSTALLED_PETS.find((p) => p.id === id) || INSTALLED_PETS[3] || INSTALLED_PETS[0]!;
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
 * 1. User's explicit project binding (if set in Connected Sessions)
 * 2. Favorite trio by slot index (Slot 0 = Primary, Slot 1 = Subagent 1, Slot 2 = Subagent 2)
 * 3. Fallback to equipped pet or deterministic fallback
 */
export function getPetForSession(
  session: { project?: string | null; agent_kind?: string; id?: string } | null | undefined,
  index: number = 0,
  equippedSlug: string = "super-saiyan-goku"
): PetArchetype {
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

  const otherPets = INSTALLED_PETS.filter((p) => p.id !== equippedSlug);
  return otherPets[(index - 1) % otherPets.length] || INSTALLED_PETS[0]!;
}
