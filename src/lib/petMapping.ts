import { INSTALLED_PETS, type PetArchetype } from "../components/pet/types.ts";

const STORAGE_KEY_PREFIX = "rust_sound_project_pet_";

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

/**
 * Maps an agent session to its distinct PetArchetype.
 * Prioritizes:
 * 1. User's explicit project binding (if set in Settings/Connected Sessions)
 * 2. In split mode (with index): index 0 = equipped pet; index > 0 = pick distinct pets from roster
 * 3. Default to equipped pet or deterministic hash
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

  // When split pets are rendered side-by-side on desktop, guarantee uniqueness!
  if (index === 0) {
    return getPetArchetype(equippedSlug);
  }

  // Remaining available pets in roster excluding equipped pet
  const otherPets = INSTALLED_PETS.filter((p) => p.id !== equippedSlug);
  const chosen = otherPets[(index - 1) % otherPets.length] || INSTALLED_PETS[0]!;
  return chosen;
}
