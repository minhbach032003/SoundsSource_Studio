import { useEffect, useRef, type FC } from "react";
import { PetRenderer } from "@/shared/lib/petRenderer";

interface AgentPetSpriteProps {
  slug: string;
  mood: "idle" | "working" | "waiting" | "done" | "celebrate" | "sleepy";
  size?: number;
  className?: string;
  onClick?: () => void;
}

export const AgentPetSprite: FC<AgentPetSpriteProps> = ({
  slug,
  mood,
  size = 200,
  className,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PetRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new PetRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const url = `/pets/${slug}/spritesheet.webp`;
    renderer.load(url);
    renderer.setState(mood);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [slug]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setState(mood);
    }
  }, [mood]);

  return (
    <div
      onClick={onClick}
      className={className}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size, imageRendering: "pixelated" }}
        className="cursor-pointer select-none"
      />
    </div>
  );
};
