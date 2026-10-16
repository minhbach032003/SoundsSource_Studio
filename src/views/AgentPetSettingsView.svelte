<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";
  import PetDisplaySettings from "@/components/pet/PetDisplaySettings.svelte";
  import { navigateTo } from "@/lib/navigation";
</script>

<div class="w-full max-w-xl space-y-4">
  <button type="button" class="btn btn-ghost text-xs flex items-center gap-1.5" onclick={() => navigateTo("pet")}>
    <ArrowLeft size={14} />Back to AgentPet
  </button>
  <div class="panel p-4 sm:p-5">
    <h2 class="text-sm font-semibold text-(--ink) m-0">AgentPet Settings</h2>
    <p class="text-xs text-(--muted) mt-1 mb-3">Desktop display and sprite animation preferences. Idle and sleepy animations are capped at 2 FPS.</p>
    <PetDisplaySettings />
  </div>
</div>
