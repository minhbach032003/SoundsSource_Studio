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
  // .panel carries pingloom's bezel ring + plate, including its own radius and shadow.
  default: "panel text-[var(--ink)]",
  muted:
    "bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur-md text-[var(--ink)] border border-[var(--line)]",
  outline: "bg-transparent border border-[var(--line)] text-[var(--ink)]",
  dashed: "bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] backdrop-blur-sm border border-dashed border-[var(--line)] text-center text-[var(--muted)]",
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
          "rounded-2xl transition-all duration-150",
          CARD_VARIANTS[variant],
          PADDING_CLASSES[padding],
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--line)]">
            <div>
              {title && (
                <h3 className="text-xs font-heading font-bold tracking-tight text-[var(--ink)] m-0">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[10px] text-[var(--muted)] m-0 mt-0.5">{subtitle}</p>
              )}
            </div>
            {extra && <div className="flex items-center gap-2">{extra}</div>}
          </div>
        )}

        <div>{children}</div>

        {footer && (
          <div className="mt-3 pt-2 border-t border-[var(--line)] text-xs text-[var(--muted)]">
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
