import type { FC } from "react";
import { cn } from "@/lib/utils";

export interface EqualizerComponentProps {
  className?: string;
  bars?: number;
  active?: boolean;
}

/**
 * Hiệu ứng cột sóng âm thanh động (EqualizerComponent):
 * Mô phỏng chuyển động phát nhạc của ứng dụng với hiệu ứng wave CSS tinh tế.
 */
export const EqualizerComponent: FC<EqualizerComponentProps> = ({
  className,
  bars = 3,
  active = true,
}) => {
  return (
    <div
      className={cn("flex items-end gap-0.5 h-2.5", className)}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full bg-sky-400",
            active && "eq-bar"
          )}
        />
      ))}
    </div>
  );
};

EqualizerComponent.displayName = "EqualizerComponent";

/** Alias ngắn gọn cho EqualizerComponent */
export const Equalizer = EqualizerComponent;
