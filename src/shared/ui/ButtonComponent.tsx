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
    "bg-sky-500 text-slate-950 font-semibold shadow hover:bg-sky-400 active:scale-95 border border-sky-400/30",
  secondary:
    "bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 border border-white/5",
  outline:
    "border border-white/10 bg-slate-900/60 hover:bg-slate-800 hover:text-white hover:border-white/20 active:scale-95 text-slate-300",
  destructive:
    "bg-rose-500/15 text-rose-400 border border-rose-500/35 hover:bg-rose-500/25 active:scale-95 shadow-[0_0_10px_rgba(251,113,133,0.15)]",
  ghost: "hover:bg-white/5 hover:text-white text-slate-400 active:scale-95",
  link: "text-sky-400 underline-offset-4 hover:underline p-0 h-auto",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[11px] rounded-md gap-1.5",
  md: "h-8 px-3.5 text-xs rounded-lg gap-2",
  lg: "h-10 px-4 text-sm rounded-lg gap-2.5",
  icon: "h-8 w-8 rounded-lg p-0 justify-center",
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
