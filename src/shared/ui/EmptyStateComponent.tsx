import type { ReactNode } from "react";
import { Music } from "lucide-react";
import { CardComponent } from "./CardComponent";
import { cn } from "@/lib/utils";

export interface EmptyStateComponentProps {
  className?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Khung trạng thái rỗng tùy chỉnh (EmptyStateComponent):
 * Hiển thị thông điệp khi danh sách không có dữ liệu, kèm icon và nút bấm hành động.
 */
export const EmptyStateComponent: React.FC<EmptyStateComponentProps> = ({
  className,
  icon,
  title,
  description,
  action,
}) => {
  return (
    <CardComponent
      variant="dashed"
      padding="lg"
      className={cn("text-center", className)}
    >
      <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center mx-auto mb-3">
        {icon || <Music className="w-5 h-5" />}
      </div>

      <strong className="block text-sm font-semibold text-slate-100">
        {title}
      </strong>

      {description && (
        <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </CardComponent>
  );
};

EmptyStateComponent.displayName = "EmptyStateComponent";

/** Alias ngắn gọn cho EmptyStateComponent */
export const EmptyState = EmptyStateComponent;
