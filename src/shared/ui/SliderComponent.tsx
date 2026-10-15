import { useState, useEffect, type FC, type InputHTMLAttributes, type ChangeEvent, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface SliderComponentProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  unit?: string;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}

/**
 * Thanh trượt âm lượng tùy chỉnh (SliderComponent):
 * Hiển thị đường track phát sáng theo phần trăm âm lượng thực tế,
 * hỗ trợ cập nhật mượt mà khi kéo và kích hoạt sự kiện onCommit khi buông chuột/chạm.
 */
export const SliderComponent: FC<SliderComponentProps> = ({
  className,
  value,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  unit = "%",
  disabled = false,
  onChange,
  onCommit,
  ...props
}) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const percentage = Math.min(100, Math.max(0, ((localVal - min) / (max - min)) * 100));

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalVal(val);
    onChange?.(val);
  };

  const handleRelease = () => {
    onCommit?.(localVal);
  };

  return (
    <div className={cn("flex items-center gap-3 w-full", className)}>
      <div className="relative flex-1 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localVal}
          disabled={disabled}
          onChange={handleInput}
          onPointerUp={handleRelease}
          onTouchEnd={handleRelease}
          onKeyUp={handleRelease}
          style={{ "--level": `${percentage}%` } as CSSProperties}
          className={cn(
            "volume-slider",
            disabled && "opacity-45 cursor-not-allowed"
          )}
          {...props}
        />
      </div>

      {showValue && (
        <output className="min-w-9 text-right text-xs font-mono font-semibold text-[var(--muted)] tabular-nums select-none">
          {localVal}
          {unit}
        </output>
      )}
    </div>
  );
};

SliderComponent.displayName = "SliderComponent";

/** Alias ngắn gọn cho SliderComponent */
export const Slider = SliderComponent;
