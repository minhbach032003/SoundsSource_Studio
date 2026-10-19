<script lang="ts">
  import { toastState } from "@/lib/toast.svelte";
  import { CheckCircle2, AlertCircle, Info, X } from "@lucide/svelte";

  let { placement = "auto" }: { placement?: "auto" | "bottom-right" | "popover" } = $props();
</script>

{#if toastState.items.length > 0}
  <div
    class="fixed z-50 flex flex-col gap-1.5 pointer-events-none select-none transition-all duration-200 {placement === 'popover'
      ? 'bottom-[46px] left-3 right-3 items-center'
      : 'bottom-4 right-4 max-w-[calc(100vw-24px)] sm:max-w-sm w-full'}"
    role="region"
    aria-label="Notifications"
    aria-live="polite"
  >
    {#each toastState.items as toast (toast.id)}
      {@const isSuccess = toast.type === "success"}
      {@const isError = toast.type === "error"}
      <div
        class="pointer-events-auto flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-xl transition-all duration-200 bg-(--surface) text-(--ink) {isSuccess
          ? 'border-(--success)/40 shadow-[0_4px_16px_color-mix(in_srgb,var(--success)_20%,transparent)]'
          : isError
          ? 'border-(--error)/40 shadow-[0_4px_16px_color-mix(in_srgb,var(--error)_20%,transparent)]'
          : 'border-(--line) shadow-[0_8px_24px_rgba(0,0,0,0.3)]'}"
      >
        <div class="flex items-center gap-2 min-w-0">
          {#if isSuccess}
            <CheckCircle2 class="w-3.5 h-3.5 text-(--success) shrink-0" />
          {:else if isError}
            <AlertCircle class="w-3.5 h-3.5 text-(--error) shrink-0" />
          {:else}
            <Info class="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
          {/if}
          <span class="text-[11px] font-medium tracking-tight text-(--ink) truncate">
            {toast.message}
          </span>
        </div>

        <button
          type="button"
          onclick={() => toastState.remove(toast.id)}
          class="text-(--muted) hover:text-(--ink) p-0.5 rounded-full transition-colors cursor-pointer shrink-0 ml-1"
          aria-label="Dismiss toast"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    {/each}
  </div>
{/if}
