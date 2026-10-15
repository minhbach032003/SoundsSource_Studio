import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonComponentProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm hover:opacity-90 active:scale-95 border border-[var(--line)]",
  secondary:
    "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--paper)] active:scale-95 border border-[var(--line)]",
  outline:
    "border border-[var(--input-line)] bg-[var(--paper)] hover:bg-[var(--surface)] hover:text-[var(--ink)] hover:border-[var(--focus)] active:scale-95 text-[var(--ink)]",
  destructive:
    "bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 active:scale-95",
  ghost: "hover:bg-[var(--surface)] hover:text-[var(--ink)] text-[var(--muted)] active:scale-95",
  link: "text-[var(--accent)] underline-offset-4 hover:underline p-0 h-auto",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[11px] rounded-lg gap-1.5",
  md: "h-8.5 px-4 text-xs rounded-xl gap-2",
  lg: "h-10 px-5 text-sm rounded-xl gap-2.5",
  icon: "h-8.5 w-8.5 rounded-xl p-0 justify-center",
};

/**
 * Nút bấm tùy chỉnh đa năng (ButtonComponent):
 * Hỗ trợ các biến thể màu (primary, outline, destructive...), kích thước,
 * trạng thái loading với spinner và các icon trái / phải.
 */
export const ButtonComponent = forwardRef<HTMLButtonElement, ButtonComponentProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-120 select-none cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-current" />
        ) : (
          leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>
        )}

        {children && <span>{children}</span>}

        {!loading && rightIcon && (
          <span className="shrink-0 flex items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

ButtonComponent.displayName = "ButtonComponent";

/** Alias ngắn gọn cho ButtonComponent */
export const Button = ButtonComponent;
