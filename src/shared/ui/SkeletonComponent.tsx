import type { FC, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SkeletonComponentProps
  extends HTMLAttributes<HTMLDivElement> {
  variant?: "line" | "avatar" | "card";
}

/**
 * Hiệu ứng khung xương tải dữ liệu (SkeletonComponent):
 * Hỗ trợ các biến thể dạng dòng (line), avatar và thẻ bài (card).
 */
export const SkeletonComponent: FC<SkeletonComponentProps> = ({
  className,
  variant = "line",
  ...props
}) => {
  if (variant === "card") {
    return (
      <div
        className={cn(
          "p-3.5 rounded-xl border border-white/8 bg-[#151b23] flex items-center gap-3 skeleton-shimmer",
          className
        )}
        {...props}
      >
        <div className="w-9 h-9 rounded-xl bg-slate-800 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/3 bg-slate-800 rounded" />
          <div className="h-2.5 w-1/4 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  if (variant === "avatar") {
    return (
      <div
        className={cn(
          "w-9 h-9 rounded-xl bg-slate-800/80 skeleton-shimmer shrink-0",
          className
        )}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn(
        "h-3 rounded-md bg-slate-800/80 skeleton-shimmer",
        className
      )}
      {...props}
    />
  );
};

SkeletonComponent.displayName = "SkeletonComponent";

/** Alias ngắn gọn cho SkeletonComponent */
export const Skeleton = SkeletonComponent;
