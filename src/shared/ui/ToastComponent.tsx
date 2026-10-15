import {
  createContext,
  useContext,
  useState,
  useCallback,
  type FC,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "info" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, type, message };

    setToasts((prev) => {
      // Deduplicate: filter out any existing toast with the exact same message
      const withoutDup = prev.filter((t) => t.message !== message);
      // Keep at most 1 previous so max active toasts is 2
      return [...withoutDup.slice(-1), newToast];
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-center justify-between gap-3 p-3 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 duration-200 bg-[var(--surface)] text-[var(--ink)]",
                isSuccess
                  ? "border-emerald-500/40 shadow-[0_4px_16px_rgba(16,185,129,0.15)]"
                  : isError
                  ? "border-rose-500/40 shadow-[0_4px_16px_rgba(244,63,94,0.15)]"
                  : "border-sky-400/40 shadow-[0_4px_16px_rgba(56,189,248,0.15)]"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4 text-[var(--error)] shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                )}
                <span className="text-xs font-medium tracking-tight text-[var(--ink)] truncate">
                  {toast.message}
                </span>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-[var(--muted)] hover:text-[var(--ink)] p-0.5 rounded transition-colors cursor-pointer shrink-0"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
