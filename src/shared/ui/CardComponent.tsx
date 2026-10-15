import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "muted" | "outline" | "dashed";

export interface CardComponentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  footer?: ReactNode;
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const CARD_VARIANTS: Record<CardVariant, string> = {
  default:
    "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--focus)] shadow-sm",
  muted:
    "bg-[var(--paper)] text-[var(--ink)] border border-[var(--line)]",
  outline: "bg-transparent border border-[var(--line)] text-[var(--ink)]",
  dashed: "bg-[var(--surface)] border border-dashed border-[var(--line)] text-center text-[var(--muted)]",
};

const PADDING_CLASSES = {
  none: "p-0",
  sm: "p-3",
  md: "p-4 sm:p-4.5",
  lg: "p-5 sm:p-6",
};

/**
 * Thẻ chứa nội dung tùy chỉnh (CardComponent):
 * Hỗ trợ tiêu đề, phụ đề, khu vực nút điều khiển góc phải (extra), và chân trang (footer).
 */
export const CardComponent = forwardRef<HTMLDivElement, CardComponentProps>(
  (
    {
      className,
      title,
      subtitle,
      extra,
      footer,
      variant = "default",
      padding = "md",
      children,
      ...props
    },
    ref
  ) => {
    const hasHeader = title || subtitle || extra;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl transition-all duration-150 text-stone-100",
          CARD_VARIANTS[variant],
          PADDING_CLASSES[padding],
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/5">
            <div>
              {title && (
                <h3 className="text-xs font-heading font-bold tracking-tight text-white m-0">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[10px] text-stone-400 m-0 mt-0.5">{subtitle}</p>
              )}
            </div>
            {extra && <div className="flex items-center gap-2">{extra}</div>}
          </div>
        )}

        <div>{children}</div>

        {footer && (
          <div className="mt-3 pt-2 border-t border-white/5 text-xs text-slate-400">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

CardComponent.displayName = "CardComponent";

/** Alias ngắn gọn cho CardComponent */
export const Card = CardComponent;
