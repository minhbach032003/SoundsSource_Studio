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
            className="text-xs font-medium text-slate-300 select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-2.5 text-slate-400 pointer-events-none flex items-center">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "h-8 px-3 rounded-lg bg-slate-950/80 border text-xs text-slate-200 transition-colors",
              "border-white/10 placeholder:text-slate-500",
              "focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400",
              "disabled:opacity-45 disabled:cursor-not-allowed",
              error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500",
              leftIcon && "pl-8",
              rightIcon && "pr-8",
              fullWidth ? "w-full" : "w-auto",
              className
            )}
            {...props}
          />

          {rightIcon && (
            <span className="absolute right-2.5 text-slate-400 pointer-events-none flex items-center">
              {rightIcon}
            </span>
          )}
        </div>

        {error ? (
          <p className="text-[11px] text-rose-400 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-[11px] text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

InputComponent.displayName = "InputComponent";

/** Alias ngắn gọn cho InputComponent */
export const Input = InputComponent;
