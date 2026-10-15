import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "playing"
  | "emerald"
  | "coral"
  | "rose"
  | "amber"
  | "outline";

export interface BadgeComponentProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--accent)]/15 text-[var(--ink)] border border-[var(--accent)]/40 font-medium",
  secondary:
    "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)]",
  playing:
    "bg-[var(--accent)]/20 text-[var(--ink)] border border-[var(--accent)]/50 font-bold uppercase tracking-wider",
  emerald:
    "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
  coral:
    "bg-rose-500/15 text-rose-500 border border-rose-500/30",
  rose:
    "bg-[var(--accent)]/15 text-[var(--ink)] border border-[var(--accent)]/30",
  amber:
    "bg-amber-500/15 text-amber-500 border border-amber-500/30",
  outline:
    "bg-transparent text-[var(--muted)] border border-[var(--line)]",
};

/**
 * Nhãn trạng thái tùy chỉnh (BadgeComponent):
 * Hỗ trợ các biến thể màu sắc, chấm trạng thái (dot indicator) và kiểu nhãn nhỏ gọn.
 */
export const BadgeComponent: React.FC<BadgeComponentProps> = ({
  className,
  variant = "default",
  dot = false,
  children,
  ...props
}) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold select-none",
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "emerald"
              ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
              : variant === "coral"
              ? "bg-rose-400 shadow-[0_0_6px_#fb7185]"
              : "bg-sky-400 shadow-[0_0_6px_#38bdf8]"
          )}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};

BadgeComponent.displayName = "BadgeComponent";

/** Alias ngắn gọn cho BadgeComponent */
export const Badge = BadgeComponent;
