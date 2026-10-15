import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputComponentProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Ô nhập văn bản tùy chỉnh (InputComponent):
 * Hỗ trợ nhãn (label), thông báo lỗi (error), văn bản hướng dẫn (helperText), và icon trái / phải.
 */
export const InputComponent = forwardRef<HTMLInputElement, InputComponentProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--ink)] select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-2.5 text-[var(--muted)] pointer-events-none flex items-center">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "h-8 px-3 rounded-lg bg-[var(--paper)] border text-xs text-[var(--ink)] transition-colors",
              "border-[var(--line)] placeholder:text-[var(--muted)]",
              "focus:outline-none focus:border-[var(--focus)] focus:ring-1 focus:ring-[var(--focus)]/30",
              "disabled:opacity-45 disabled:cursor-not-allowed",
              error &&
                "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]",
              leftIcon && "pl-8",
              rightIcon && "pr-8",
              fullWidth ? "w-full" : "w-auto",
              className
            )}
            {...props}
          />

          {rightIcon && (
            <span className="absolute right-2.5 text-[var(--muted)] pointer-events-none flex items-center">
              {rightIcon}
            </span>
          )}
        </div>

        {error ? (
          <p className="text-[11px] text-[var(--error)] font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-[11px] text-[var(--muted)]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

InputComponent.displayName = "InputComponent";

/** Alias ngắn gọn cho InputComponent */
export const Input = InputComponent;
