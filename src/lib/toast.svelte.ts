export type ToastType = "success" | "info" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export class ToastState {
  items = $state<ToastItem[]>([]);

  get toasts(): ToastItem[] {
    return this.items;
  }

  show(type: ToastType, message: string): string {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, type, message };

    // Deduplicate: filter out any existing toast with the exact same message
    const withoutDup = this.items.filter((t) => t.message !== message);
    // Keep at most 1 previous so max active toasts is 2
    this.items = [...withoutDup.slice(-1), newToast];

    if (typeof setTimeout !== "undefined") {
      setTimeout(() => {
        this.remove(id);
      }, 2000);
    }

    return id;
  }

  remove(id: string): void {
    this.items = this.items.filter((t) => t.id !== id);
  }

  clear(): void {
    this.items = [];
  }

  success(message: string): string {
    return this.show("success", message);
  }

  info(message: string): string {
    return this.show("info", message);
  }

  error(message: string): string {
    return this.show("error", message);
  }
}

export const toastState = new ToastState();

/** Svelte 5 hook / store accessor returning the global toastState */
export function useToast(): ToastState {
  return toastState;
}
