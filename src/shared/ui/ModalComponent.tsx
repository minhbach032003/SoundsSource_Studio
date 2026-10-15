import { useEffect, type FC, type ReactNode } from "react";
import { ButtonComponent } from "./ButtonComponent";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalComponentProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "destructive" | "outline";
  onConfirm?: () => void;
  isLoading?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Hộp thoại Popup/Modal xác nhận (ModalComponent):
 * Bắt buộc hiển thị trước các hành động nhạy cảm hoặc không thể đảo ngược (như Đăng xuất, Reset cấu hình,...).
 * Hỗ trợ backdrop blur, phím Esc để đóng và nút xác nhận theo từng biến thể.
 */
export const ModalComponent: FC<ModalComponentProps> = ({
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
  children,
  className,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Box */}
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] shadow-2xl p-5 z-10 transition-all transform animate-in fade-in zoom-in-95 duration-150",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              confirmVariant === "destructive"
                ? "bg-[var(--error)]/15 border-[var(--error)]/30 text-[var(--error)]"
                : "bg-[var(--accent)]/15 border-[var(--accent)]/30 text-[var(--accent-text)]"
            )}
          >
            {icon || <AlertTriangle className="w-5 h-5" />}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3
              id="modal-title"
              className="text-sm font-semibold text-[var(--ink)] m-0 tracking-tight"
            >
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[var(--muted)] mt-1 m-0 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer p-1 rounded-lg hover:bg-[var(--paper)]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        {children && <div className="mt-4">{children}</div>}

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-[var(--line)]">
          <ButtonComponent
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </ButtonComponent>

          <ButtonComponent
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmText}
          </ButtonComponent>
        </div>
      </div>
    </div>
  );
};

ModalComponent.displayName = "ModalComponent";

/** Alias ngắn gọn cho ModalComponent */
export const Modal = ModalComponent;
