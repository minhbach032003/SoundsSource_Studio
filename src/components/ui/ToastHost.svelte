<script lang="ts">
  import { toastState } from "@/lib/toast.svelte";
  import { CheckCircle2, AlertCircle, Info, X } from "@lucide/svelte";
</script>

{#if toastState.items.length > 0}
  <div
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none"
    role="region"
    aria-label="Notifications"
    aria-live="polite"
  >
    {#each toastState.items as toast (toast.id)}
      {@const isSuccess = toast.type === "success"}
      {@const isError = toast.type === "error"}
      <div
        class="pointer-events-auto flex items-center justify-between gap-3 p-3 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 bg-(--surface) text-(--ink) {isSuccess
          ? 'border-(--success)/40 shadow-[0_4px_16px_color-mix(in_srgb,var(--success)_15%,transparent)]'
          : isError
          ? 'border-(--error)/40 shadow-[0_4px_16px_color-mix(in_srgb,var(--error)_15%,transparent)]'
          : 'border-(--accent)/40 shadow-[0_4px_16px_color-mix(in_srgb,var(--accent)_15%,transparent)]'}"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          {#if isSuccess}
            <CheckCircle2 class="w-4 h-4 text-(--success) shrink-0" />
          {:else if isError}
            <AlertCircle class="w-4 h-4 text-(--error) shrink-0" />
          {:else}
            <Info class="w-4 h-4 text-(--accent-text) shrink-0" />
          {/if}
          <span class="text-xs font-medium tracking-tight text-(--ink) truncate">
            {toast.message}
          </span>
        </div>

        <button
          type="button"
          onclick={() => toastState.remove(toast.id)}
          class="text-(--muted) hover:text-(--ink) p-0.5 rounded transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss toast"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    {/each}
  </div>
{/if}
