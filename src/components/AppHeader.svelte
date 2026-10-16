<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import AppLogo from "@/components/icons/AppLogo.svelte";

  interface Props {
    onRefresh?: () => void;
    isLoading?: boolean;
  }

  let { onRefresh, isLoading = false }: Props = $props();
</script>

<header class="flex items-center justify-between pb-3 border-b border-(--line) bg-(--paper)">
  <div class="flex items-center gap-2.5">
    <AppLogo size="sm" variant="with-wordmark" />
  </div>

  <div class="flex items-center gap-3">
    <div class="status-indicator">
      <span class="status-dot"></span>
      <span class="text-[11px] font-medium text-(--success)">CoreAudio Active</span>
    </div>

    <button
      id="refresh-btn"
      type="button"
      class="btn border border-(--input-line) bg-(--paper) hover:bg-(--surface) hover:text-(--ink) hover:border-(--focus) h-8.5 w-8.5 rounded-xl p-0 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Refresh audio applications"
      title="Refresh applications"
      onclick={() => onRefresh?.()}
      disabled={isLoading}
    >
      <RefreshCw class={isLoading ? "animate-spin text-(--accent) w-4 h-4" : "text-(--muted) w-4 h-4"} />
    </button>
  </div>
</header>
