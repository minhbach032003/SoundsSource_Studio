<script lang="ts">
  import { onMount } from "svelte";
  import { fetchPetCatalog, installCloudPet, installedPetIds, type PetCloudEntry } from "@/lib/petCloud";
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
    Download,
    CloudDownload,
    LoaderCircle,
    Eye,
  } from "@lucide/svelte";

  interface Props {
    selectedPet: string;
    previewPet?: string | null;
    careState?: PetCareStateDto | null;
    onSelectPet?: (slug: string) => void;
    onPreviewPet?: (slug: string) => void;
  }

  let {
    selectedPet = $bindable("code-frenzy-cat"),
    previewPet = null,
    careState = null,
    onSelectPet,
    onPreviewPet,
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
    activePets.find((p) => p.id === (previewPet || selectedPet)) ?? activePets[0] ?? INSTALLED_PETS[0]
  );

  const filteredPets = $derived(
    activeFilter === "all"
      ? activePets
      : activePets.filter((p) => p.tag === activeFilter)
  );

  function handleCardClick(pet: PetArchetype) {
    if (onPreviewPet) {
      onPreviewPet(pet.id);
    } else {
      handleEquip(pet);
    }
  }

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

  let cloudPets = $state<PetCloudEntry[]>([]);
  let cloudLoading = $state(true);
  let cloudError = $state("");
  let installedIds = $state<string[]>([]);
  let downloadingId = $state<string | null>(null);
  let downloadProgress = $state(0);
  let downloadError = $state("");
  let alive = true;

  async function loadCloudPets() {
    cloudLoading = true;
    cloudError = "";
    try {
      const pets = await fetchPetCatalog();
      if (alive) cloudPets = pets;
    } catch {
      if (alive) cloudError = "Không tải được danh mục Cloudinary. Kiểm tra kết nối hoặc chạy pnpm pets:upload để xuất bản danh mục.";
    } finally { if (alive) cloudLoading = false; }
  }

  onMount(() => {
    alive = true;
    const sync = () => installedIds = installedPetIds();
    sync();
    window.addEventListener("pet-assets-changed", sync);
    void loadCloudPets();
    return () => { alive = false; window.removeEventListener("pet-assets-changed", sync); };
  });

  async function handleDownloadPet(entry: PetCloudEntry) {
    if (downloadingId || installedIds.includes(entry.id)) return;
    downloadingId = entry.id;
    downloadProgress = 0;
    downloadError = "";
    try {
      await installCloudPet(entry, (done, total) => { if (alive) downloadProgress = Math.round(done / total * 100); });
      if (alive) {
        installedIds = installedPetIds();
        toastState.success(`Đã tải ${INSTALLED_PETS.find(p => p.id === entry.id)?.name} để dùng offline.`);
      }
    } catch (error) {
      if (alive) {
        downloadError = `Không thể lưu pet: ${String(error)} Bấm Tải về để thử lại.`;
        toastState.error("Tải pet thất bại. Pet đã cài vẫn được giữ nguyên.");
      }
    } finally { if (alive) downloadingId = null; }
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
          {INSTALLED_PETS.length} Authentic Pixel-Art Archetypes · 1-Click Equip
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
      {@const isPreviewing = previewPet === pet.id && !isSelected}
      {@const isUnlocked = currentLevel >= pet.unlockLevel}

      <div
        role="button"
        tabindex="0"
        onclick={() => handleCardClick(pet)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick(pet);
          }
        }}
        class="p-2.5 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition-all text-center group cursor-pointer relative overflow-hidden {isSelected
          ? 'bg-(--accent)/15 border-(--accent) ring-2 ring-(--accent)/30 text-(--ink) shadow-sm'
          : isPreviewing
          ? 'bg-(--accent)/25 border-(--accent) ring-2 ring-(--focus) text-(--ink) shadow-md'
          : 'bg-(--paper) border-(--line) text-(--muted) hover:text-(--ink) hover:border-(--focus)'}"
        title="{pet.name} — {pet.description}"
      >
        <!-- Active Checkmark Indicator -->
        {#if isSelected}
          <span
            class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-(--accent) text-(--accent-ink) flex items-center justify-center font-bold shadow-sm z-10"
            title="Equipped active companion"
          >
            <Check class="w-2.5 h-2.5 stroke-[3]" />
          </span>
        {:else if isPreviewing}
          <span
            class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-(--accent) text-(--accent-ink) flex items-center justify-center font-bold shadow-sm z-10"
            title="Currently previewing"
          >
            <Eye class="w-2.5 h-2.5" />
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
            mood={isSelected || isPreviewing ? "working" : "idle"}
            size={56}
            level={currentLevel}
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
          <span class="text-[11px] font-bold block truncate leading-tight text-(--ink)">
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

        <!-- Quick 1-Click Equip Button -->
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            handleEquip(pet);
          }}
          class="w-full mt-1 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer {isSelected
            ? 'bg-(--accent)/20 text-(--accent-text) border-(--accent)/40'
            : isPreviewing
            ? 'btn btn-primary h-5 text-[10px] py-0'
            : 'bg-(--surface) hover:bg-(--line) border-(--line) text-(--muted) hover:text-(--ink)'}"
        >
          {isSelected ? "Equipped" : "Equip"}
        </button>
      </div>
    {/each}
  </div>

  <!-- Selected Pet Archetype Inspector Ribbon -->
  <div class="p-2.5 rounded-xl bg-(--paper) border border-(--line) flex items-center justify-between gap-3 text-xs flex-wrap">
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
          <span class="text-[10px] text-(--accent-text) font-medium truncate max-w-full">· {currentPet.tagline}</span>
        </div>
        <p class="text-[10px] text-(--muted) m-0 truncate mt-0.5">{currentPet.description}</p>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      {#if selectedPet === currentPet.id}
        <span class="text-[10px] font-semibold text-(--success) flex items-center gap-1">
          <Check class="w-3 h-3 text-(--success)" />
          Equipped
        </span>
      {:else}
        <span class="text-[10px] font-semibold text-(--accent-text) flex items-center gap-1">
          <Eye class="w-3 h-3 text-(--accent-text)" />
          Previewing
        </span>
        <button
          type="button"
          onclick={() => handleEquip(currentPet)}
          class="btn btn-primary h-7 px-3 text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1"
        >
          <Check class="w-3 h-3" />
          <span>Equip {currentPet.name}</span>
        </button>
      {/if}
    </div>
  </div>
  <section aria-label="Pet trên Cloudinary" class="border-t border-(--line) pt-3 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h4 class="flex items-center gap-2 text-xs font-bold text-(--ink) m-0"><CloudDownload class="w-4 h-4" aria-hidden="true" />Pet trên Cloudinary</h4>
      <button type="button" onclick={() => { if (!cloudLoading) void loadCloudPets(); }} aria-disabled={cloudLoading} aria-busy={cloudLoading} class="min-h-8 px-2 border border-(--line) rounded-lg text-xs text-(--ink) hover:bg-(--surface) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--focus)">Làm mới</button>
    </div>
    <p class="text-xs text-(--muted) m-0">Tải ảnh gốc và đủ 10 hình thái về máy để dùng khi mất mạng.</p>
    {#if cloudLoading}
      <p role="status" class="text-xs text-(--muted)">Đang tải danh mục pet…</p>
    {:else if cloudError}
      <div role="alert" class="text-xs text-(--error) space-y-2">
        <p class="m-0">{cloudError}</p>
        <button type="button" onclick={() => void loadCloudPets()} class="min-h-8 px-2 rounded-lg border border-(--line) text-(--ink) hover:bg-(--surface) cursor-pointer">Thử lại</button>
      </div>
    {:else if cloudPets.length === 0}
      <p class="text-xs text-(--muted)">Chưa có pet được xuất bản trên cloud.</p>
    {:else}
      <ul class="list-none p-0 m-0 divide-y divide-(--line)">
        {#each cloudPets as entry (entry.id)}
          {@const pet = INSTALLED_PETS.find(p => p.id === entry.id)!}
          {@const installed = installedIds.includes(entry.id)}
          <li class="flex items-center justify-between gap-3 py-2">
            <div class="min-w-0 space-y-1">
              <span class="block text-xs font-semibold text-(--ink)">{pet.name}</span>
              <span class="block text-[11px] text-(--muted)">{pet.forms?.length} hình thái · {(entry.assets.reduce((n,a) => n + a.bytes, 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            <button type="button" onclick={() => void handleDownloadPet(entry)} aria-label="Tải {pet.name} về máy" aria-disabled={installed || !!downloadingId} aria-busy={downloadingId === entry.id} class="min-h-9 min-w-28 px-2 rounded-lg border border-(--line) text-xs text-(--accent-text) hover:bg-(--surface) flex items-center justify-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-(--focus)">
              {#if installed}
                <Check class="w-3.5 h-3.5 text-(--success)" aria-hidden="true" />Đã tải offline
              {:else}
                {#if downloadingId === entry.id}<LoaderCircle class="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{:else}<Download class="w-3.5 h-3.5" aria-hidden="true" />{/if}
                Tải về
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if downloadingId}
      <div role="status" aria-live="polite" class="text-xs text-(--muted) tabular-nums">{downloadProgress === 100 ? "Đang lưu vào máy…" : `Đang tải pet… ${downloadProgress}%`}</div>
      <progress class="w-full h-1.5 accent-(--accent)" value={downloadProgress} max="100" aria-label="Tiến độ tải pet"></progress>
    {/if}
    {#if downloadError}<p role="alert" class="text-xs text-(--error)">{downloadError}</p>{/if}
  </section>
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
