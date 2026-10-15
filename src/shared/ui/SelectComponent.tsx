import { forwardRef, type SelectHTMLAttributes, type ReactNode, type ChangeEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectComponentProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: SelectOption[];
  leftIcon?: ReactNode;
  error?: string;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}

/**
 * Menu chọn tùy chỉnh (SelectComponent):
 * Hỗ trợ icon bên trái, mũi tên chevron tùy chỉnh, danh sách option kiểu dữ liệu rõ ràng, và nhãn truy cập.
 */
export const SelectComponent = forwardRef<HTMLSelectElement, SelectComponentProps>(
  (
    {
      className,
      label,
      options,
      leftIcon,
      error,
      fullWidth = true,
      disabled,
      onChange,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-medium text-slate-300 select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-2.5 text-slate-400 pointer-events-none flex items-center z-10">
              {leftIcon}
            </span>
          )}

          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            onChange={handleChange}
            className={cn(
              "h-7.5 w-full rounded-md bg-[var(--paper)] border text-xs font-medium text-[var(--ink)] transition-colors appearance-none pr-7",
              "border-[var(--input-line)] hover:border-[var(--focus)]",
              "focus:outline-none focus:border-[var(--focus)] focus:ring-1 focus:ring-[var(--focus)]/30",
              "disabled:opacity-45 disabled:cursor-not-allowed",
              "text-ellipsis whitespace-nowrap overflow-hidden",
              error && "border-rose-500 focus:border-rose-500",
              leftIcon ? "pl-8" : "pl-2.5",
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="bg-[var(--paper)] text-[var(--ink)]"
              >
                {opt.label}
              </option>
            ))}
          </select>

          <ChevronDown className="absolute right-2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
        </div>

        {error && <p className="text-[11px] text-rose-400 font-medium">{error}</p>}
      </div>
    );
  }
);

SelectComponent.displayName = "SelectComponent";

/** Alias ngắn gọn cho SelectComponent */
export const Select = SelectComponent;
