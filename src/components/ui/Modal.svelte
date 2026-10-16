<script lang="ts">
  import type { Snippet } from "svelte";
  import { X, AlertTriangle, Loader2 } from "@lucide/svelte";

  interface Props {
    open: boolean;
    onClose?: () => void;
    title: string;
    description?: string;
    icon?: Snippet;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: "primary" | "destructive" | "outline";
    onConfirm?: () => void;
    isLoading?: boolean;
    allowCancelWhileLoading?: boolean;
    children?: Snippet;
    class?: string;
  }

  let {
    open,
    onClose,
    title,
    description,
    icon,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmVariant = "primary",
    onConfirm,
    isLoading = false,
    allowCancelWhileLoading = false,
    children,
    class: className = "",
  }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let previousActiveElement: HTMLElement | null = null;

  // Focus trap and keyboard handlers
  $effect(() => {
    if (!open) return;

    if (typeof document !== "undefined") {
      previousActiveElement = document.activeElement as HTMLElement | null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === "Tab" && dialogEl) {
        const focusableElements = dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogEl) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus into dialog
    const timer = setTimeout(() => {
      if (dialogEl) {
        const focusable = dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogEl.focus();
        }
      }
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Backdrop with blur and click-to-dismiss -->
    <div
      class="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
      onclick={onClose}
      aria-hidden="true"
    ></div>

    <!-- Dialog Box -->
    <div
      bind:this={dialogEl}
      tabindex="-1"
      class="relative w-full max-w-sm rounded-2xl bg-(--surface) text-(--ink) border border-(--line) shadow-2xl p-5 z-10 transition-all outline-none {className}"
    >
      <!-- Header -->
      <div class="flex items-start gap-3.5">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border {confirmVariant === 'destructive'
            ? 'bg-(--error)/15 border-(--error)/30 text-(--error)'
            : 'bg-(--accent)/15 border-(--accent)/30 text-(--accent-text)'}"
        >
          {#if icon}
            {@render icon()}
          {:else}
            <AlertTriangle class="w-5 h-5" />
          {/if}
        </div>

        <div class="flex-1 min-w-0 pr-6">
          <h3
            id="modal-title"
            class="text-sm font-semibold text-(--ink) m-0 tracking-tight"
          >
            {title}
          </h3>
          {#if description}
            <p class="text-xs text-(--muted) mt-1 m-0 leading-relaxed">
              {description}
            </p>
          {/if}
        </div>

        <button
          type="button"
          onclick={onClose}
          class="absolute top-4 right-4 text-(--muted) hover:text-(--ink) transition-colors cursor-pointer p-1 rounded-lg hover:bg-(--paper)"
          aria-label="Close dialog"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content Body -->
      {#if children}
        <div class="mt-4">
          {@render children()}
        </div>
      {/if}

      <!-- Action Footer -->
      <div class="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-(--line)">
        <button
          type="button"
          class="btn"
          onclick={onClose}
          disabled={isLoading && !allowCancelWhileLoading}
        >
          {cancelText}
        </button>

        <button
          type="button"
          class="btn {confirmVariant === 'destructive' ? 'btn-danger' : confirmVariant === 'outline' ? '' : 'btn-primary'}"
          onclick={onConfirm}
          disabled={isLoading}
        >
          {#if isLoading}
            <Loader2 class="w-4 h-4 animate-spin shrink-0 text-current" />
          {/if}
          <span>{confirmText}</span>
        </button>
      </div>
    </div>
  </div>
{/if}
