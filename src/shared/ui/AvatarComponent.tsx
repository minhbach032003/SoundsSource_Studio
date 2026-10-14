import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AvatarComponentProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  shape?: "squircle" | "circle" | "square";
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
  "linear-gradient(135deg, #6366f1 0%, #818cf8 100%)",
  "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #059669 0%, #34d399 100%)",
  "linear-gradient(135deg, #d97706 0%, #fbbf24 100%)",
  "linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)",
  "linear-gradient(135deg, #ea580c 0%, #f97316 100%)",
  "linear-gradient(135deg, #475569 0%, #64748b 100%)",
];

export function getAvatarBackground(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

const SIZE_CLASSES = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-11 h-11 text-sm",
};

const SHAPE_CLASSES = {
  squircle: "rounded-xl",
  circle: "rounded-full",
  square: "rounded-md",
};

/**
 * Avatar ứng dụng tùy chỉnh (AvatarComponent):
 * Hiển thị 2 chữ cái đầu với dải màu gradient tự động tính toán từ tên ứng dụng,
 * hoặc ảnh đại diện nếu có.
 */
export const AvatarComponent: React.FC<AvatarComponentProps> = ({
  className,
  name,
  src,
  size = "md",
  shape = "squircle",
  style,
  ...props
}) => {
  const initials = name.slice(0, 2).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          "object-cover border border-white/10 shrink-0",
          SIZE_CLASSES[size],
          SHAPE_CLASSES[shape],
          className
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex items-center justify-center font-bold tracking-tight text-white shadow-md shrink-0 border border-white/10 select-none",
        SIZE_CLASSES[size],
        SHAPE_CLASSES[shape],
        className
      )}
      style={{
        background: getAvatarBackground(name),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {initials}
    </span>
  );
};

AvatarComponent.displayName = "AvatarComponent";

/** Alias ngắn gọn cho AvatarComponent */
export const Avatar = AvatarComponent;
