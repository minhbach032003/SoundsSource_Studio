<script lang="ts">
  import AgentPetSprite from "@/components/AgentPetSprite.svelte";
  import {
    INSTALLED_PETS,
    type PetArchetype,
    type PetCareStateDto,
  } from "./types";
  import {
    Sparkles,
    Check,
    Lock,
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

  const currentLevel = $derived(careState?.display_level ?? 1);
  const currentPet = $derived(
    INSTALLED_PETS.find((p) => p.id === selectedPet) ?? INSTALLED_PETS[0]
  );

  const filteredPets = $derived(
    activeFilter === "all"
      ? INSTALLED_PETS
      : INSTALLED_PETS.filter((p) => p.tag === activeFilter)
  );

  function handleEquip(pet: PetArchetype) {
    selectedPet = pet.id;
    try {
      localStorage.setItem("rust_sound_pet_slug", pet.id);
      window.dispatchEvent(new Event("storage"));
    } catch {}
    onSelectPet?.(pet.id);
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
      <div class="flex items-center p-0.5 bg-(--paper) border border-(--line) rounded-lg text-[10px]">
        <button
          type="button"
          onclick={() => (activeFilter = "all")}
          class="px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer {activeFilter === 'all'
            ? 'bg-(--surface) text-(--ink) shadow-xs'
            : 'text-(--muted) hover:text-(--ink)'}"
        >
          All (7)
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

      <button
        type="button"
        onclick={() => handleEquip(pet)}
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
      </button>
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
