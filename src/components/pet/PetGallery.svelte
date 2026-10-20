<script lang="ts">
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import {
    INSTALLED_PETS,
    type PetArchetype,
    type PetCareStateDto,
  } from "./types";
  import {
    getActivePets,
    getDeletedPetIds,
    deletePet,
    restoreAllPets,
  } from "@/lib/petMapping";
  import { toastState } from "@/lib/toast.svelte";
  import {
    Sparkles,
    Check,
    Lock,
    Trash2,
    RotateCcw,
  } from "@lucide/svelte";

  interface Props {
    selectedPet: string;
    careState?: PetCareStateDto | null;
    onSelectPet?: (slug: string) => void;
  }

  let {
    selectedPet = $bindable("code-frenzy-cat"),
    careState = null,
    onSelectPet,
  }: Props = $props();

  let activeFilter = $state<"all" | "Creature" | "Character">("all");
  let deletedIds = $state<string[]>([]);
  let petToDelete = $state<PetArchetype | null>(null);
  let isDeleteModalOpen = $state(false);

  $effect(() => {
    deletedIds = getDeletedPetIds();
    const handleSync = () => {
      deletedIds = getDeletedPetIds();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("deleted-pets-changed", handleSync);
      window.addEventListener("storage", handleSync);
      return () => {
        window.removeEventListener("deleted-pets-changed", handleSync);
        window.removeEventListener("storage", handleSync);
      };
    }
  });

  const activePets = $derived(
    INSTALLED_PETS.filter((p) => !deletedIds.includes(p.id))
  );

  const currentLevel = $derived(careState?.display_level ?? 1);
  const currentPet = $derived(
    activePets.find((p) => p.id === selectedPet) ?? activePets[0] ?? INSTALLED_PETS[0]
  );

  const filteredPets = $derived(
    activeFilter === "all"
      ? activePets
      : activePets.filter((p) => p.tag === activeFilter)
  );

  function handleEquip(pet: PetArchetype) {
    selectedPet = pet.id;
    try {
      localStorage.setItem("rust_sound_pet_slug", pet.id);
      window.dispatchEvent(new Event("storage"));
    } catch {}
    onSelectPet?.(pet.id);
  }

  function handleRequestDelete(pet: PetArchetype, e: MouseEvent) {
    e.stopPropagation();
    if (activePets.length <= 1) {
      toastState.error("Cannot delete the last remaining companion.");
      return;
    }
    petToDelete = pet;
    isDeleteModalOpen = true;
  }

  function handleConfirmDelete() {
    if (!petToDelete) return;
    const toRemove = petToDelete;
    const success = deletePet(toRemove.id);
    if (success) {
      deletedIds = getDeletedPetIds();
      if (selectedPet === toRemove.id) {
        const remaining = getActivePets();
        const nextId = remaining[0]?.id || "code-frenzy-cat";
        selectedPet = nextId;
        onSelectPet?.(nextId);
      }
      toastState.success(`Removed companion ${toRemove.name}`);
    }
    isDeleteModalOpen = false;
    petToDelete = null;
  }

  function handleRestoreAll() {
    restoreAllPets();
    deletedIds = getDeletedPetIds();
    toastState.info("Restored all companions to gallery");
  }
</script>

<div class="panel p-4 sm:p-5 shadow-sm space-y-3.5 select-none">
  <!-- Gallery Header -->
  <div class="flex items-center justify-between pb-2.5 border-b border-(--line) gap-2 flex-wrap">
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-lg bg-(--surface) border border-(--line) flex items-center justify-center text-(--accent-text)">
        <Sparkles class="w-4 h-4" />
      </div>
      <div>
        <h4 class="text-xs font-bold text-(--ink) tracking-tight m-0">
          Companion Showcase Gallery
        </h4>
        <p class="text-[10px] text-(--muted) m-0">
          7 Authentic Pixel-Art Archetypes · 1-Click Equip
        </p>
      </div>
    </div>

    <!-- Filter Buttons & Count -->
    <div class="flex items-center gap-1.5">
      {#if deletedIds.length > 0}
        <button
          type="button"
          onclick={handleRestoreAll}
          class="px-2 py-0.5 rounded-lg border border-(--line) bg-(--paper) hover:bg-(--surface) text-[10px] text-(--accent-text) font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          title="Restore removed companions"
        >
          <RotateCcw class="w-2.5 h-2.5" />
          <span>Restore ({deletedIds.length})</span>
        </button>
      {/if}
      <div class="flex items-center p-0.5 bg-(--paper) border border-(--line) rounded-lg text-[10px]">
        <button
          type="button"
          onclick={() => (activeFilter = "all")}
          class="px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer {activeFilter === 'all'
            ? 'bg-(--surface) text-(--ink) shadow-xs'
            : 'text-(--muted) hover:text-(--ink)'}"
        >
          All ({activePets.length})
        </button>
        <button
          type="button"
          onclick={() => (activeFilter = "Creature")}
          class="px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer {activeFilter === 'Creature'
            ? 'bg-(--surface) text-(--ink) shadow-xs'
            : 'text-(--muted) hover:text-(--ink)'}"
        >
          Creatures
        </button>
        <button
          type="button"
          onclick={() => (activeFilter = "Character")}
          class="px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer {activeFilter === 'Character'
            ? 'bg-(--surface) text-(--ink) shadow-xs'
            : 'text-(--muted) hover:text-(--ink)'}"
        >
          Characters
        </button>
      </div>
    </div>
  </div>

  <!-- Pet Grid Roster -->
  <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
    {#each filteredPets as pet (pet.id)}
      {@const isSelected = selectedPet === pet.id}
      {@const isUnlocked = currentLevel >= pet.unlockLevel}

      <div
        role="button"
        tabindex="0"
        onclick={() => handleEquip(pet)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleEquip(pet);
          }
        }}
        class="p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition-all text-center group cursor-pointer relative overflow-hidden {isSelected
          ? 'bg-(--accent)/15 border-(--accent) ring-2 ring-(--accent)/30 text-(--ink) shadow-sm'
          : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
        title="{pet.name} — {pet.description}"
      >
        <!-- Active Checkmark Indicator -->
        {#if isSelected}
          <span
            class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-(--accent) text-(--accent-ink) flex items-center justify-center font-bold shadow-sm z-10"
          >
            <Check class="w-2.5 h-2.5 stroke-[3]" />
          </span>
        {:else if !isUnlocked}
          <span
            class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-(--paper) border border-(--line) text-(--muted) flex items-center justify-center text-[9px] z-10"
            title="Unlocks at Level {pet.unlockLevel}"
          >
            <Lock class="w-2.5 h-2.5" />
          </span>
        {/if}

        <!-- Remove Companion Action Button -->
        {#if activePets.length > 1}
          <button
            type="button"
            onclick={(e) => handleRequestDelete(pet, e)}
            class="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-(--surface)/80 hover:bg-(--error)/15 text-(--muted) hover:text-(--error) flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
            title="Remove {pet.name}"
          >
            <Trash2 class="w-2.5 h-2.5" />
          </button>
        {/if}

        <!-- Mini Sprite Preview using AgentPetSprite -->
        <div class="relative w-14 h-14 flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
          <AgentPetSprite
            slug={pet.id}
            mood={isSelected ? "working" : "idle"}
            size={56}
          />
          <img
            src={pet.avatarUrl}
            alt={pet.name}
            class="absolute bottom-0 right-0 w-4 h-4 rounded-full border border-(--line) object-cover bg-(--surface) shadow-xs opacity-85 group-hover:opacity-100 transition-opacity"
            title="{pet.name} Vector Avatar"
          />
        </div>

        <!-- Name and Tag -->
        <div class="w-full min-w-0">
          <span class="text-[11px] font-bold block truncate leading-tight {isSelected ? 'text-(--ink)' : 'text-(--ink)'}">
            {pet.name}
          </span>
          <div class="flex items-center justify-center gap-1 mt-0.5">
            <span class="text-[9px] text-(--muted) font-mono truncate">
              {pet.tag}
            </span>
            {#if pet.unlockLevel > 1}
              <span class="text-[8px] px-1 py-0 rounded bg-(--surface) border border-(--line) text-(--muted) font-mono">
                Lv {pet.unlockLevel}
              </span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Selected Pet Archetype Inspector Ribbon -->
  <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3 text-xs">
    <div class="flex items-center gap-2.5 min-w-0">
      <img
        src={currentPet.avatarUrl}
        alt={currentPet.name}
        class="w-8 h-8 rounded-full border border-(--line) shrink-0 object-cover bg-(--surface) shadow-xs"
      />
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="font-bold text-(--ink) text-xs truncate">{currentPet.name}</span>
          <span class="badge text-[9px] px-1.5 py-0">{currentPet.tag}</span>
          <span class="text-[10px] text-(--accent-text) font-medium truncate">· {currentPet.tagline}</span>
        </div>
        <p class="text-[10px] text-(--muted) m-0 truncate mt-0.5">{currentPet.description}</p>
      </div>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      <span class="text-[10px] font-semibold text-(--success) flex items-center gap-1">
        <Check class="w-3 h-3 text-(--success)" />
        Equipped
      </span>
    </div>
  </div>
</div>

<!-- Modal Confirmation for Deleting / Removing Companion -->
<Modal
  open={isDeleteModalOpen}
  onClose={() => {
    isDeleteModalOpen = false;
    petToDelete = null;
  }}
  title="Remove Companion"
  description="Are you sure you want to remove this companion from your active roster? You can restore it anytime."
  confirmText="Remove"
  confirmVariant="destructive"
  onConfirm={handleConfirmDelete}
>
  {#snippet children()}
    {#if petToDelete}
      <div class="flex items-center gap-2.5 p-2 rounded-lg bg-(--surface) border border-(--line) my-2">
        <img
          src={petToDelete.avatarUrl}
          alt={petToDelete.name}
          class="w-8 h-8 rounded-full border border-(--line) object-cover shrink-0"
        />
        <div class="min-w-0">
          <span class="font-bold text-xs text-(--ink) block truncate">{petToDelete.name}</span>
          <span class="text-[10px] text-(--muted) block truncate">{petToDelete.tagline}</span>
        </div>
      </div>
    {/if}
  {/snippet}
</Modal>
