import type { FC } from "react";
import {
  AlertTriangle,
  FastForward,
  Navigation,
  Swords,
  LifeBuoy,
  Eye,
  HelpCircle,
  EyeOff,
  Crosshair,
  Fish,
  Sparkles,
  ShieldAlert,
  Target,
  Anchor,
  HeartPulse,
  Droplets,
  Zap,
  Skull,
  Flame,
  Shield,
  Castle,
  Lamp,
  Users,
  Wheat,
  Glasses,
  Bot,
  Smile,
  ThumbsDown,
  Heart,
  Frown,
  ThumbsUp,
  Crown,
  CheckCheck,
  Dumbbell,
  Mic,
  MicOff,
  Volume2,
  Sliders,
  Headphones,
  type LucideProps,
} from "lucide-react";

interface PingVectorIconProps extends LucideProps {
  iconKey?: string;
  pingId?: string;
}

const ICON_MAP: Record<string, FC<LucideProps>> = {
  // Tactical
  "alert-triangle": AlertTriangle,
  "fast-forward": FastForward,
  "navigation": Navigation,
  "swords": Swords,
  "life-buoy": LifeBuoy,
  "eye": Eye,
  "help-circle": HelpCircle,
  "eye-off": EyeOff,
  "crosshair": Crosshair,
  "fish": Fish,
  "sparkles": Sparkles,
  "shield-alert": ShieldAlert,
  "target": Target,
  "anchor": Anchor,
  "heart-pulse": HeartPulse,
  "droplets": Droplets,
  "zap": Zap,

  // Objectives
  "skull": Skull,
  "flame": Flame,
  "shield": Shield,
  "castle": Castle,
  "lamp": Lamp,
  "users": Users,
  "wheat": Wheat,

  // Emotes
  "glasses": Glasses,
  "bot": Bot,
  "smile": Smile,
  "thumbs-down": ThumbsDown,
  "heart": Heart,
  "frown": Frown,
  "thumbs-up": ThumbsUp,
  "crown": Crown,
  "check-check": CheckCheck,
  "dumbbell": Dumbbell,

  // Audio
  "mic": Mic,
  "mic-off": MicOff,
  "volume-2": Volume2,
  "sliders": Sliders,
  "headphones": Headphones,
};

const ID_FALLBACK_MAP: Record<string, FC<LucideProps>> = {
  danger: AlertTriangle,
  push: FastForward,
  omw: Navigation,
  allin: Swords,
  assist: LifeBuoy,
  needvision: Eye,
  missing: HelpCircle,
  enemyvision: EyeOff,
  generic: Crosshair,
  bait: Fish,
  visioncleared: Sparkles,
  retreat: ShieldAlert,
  target_enemy: Target,
  hold_position: Anchor,
  heal_me: HeartPulse,
  out_of_mana: Droplets,
  ult_ready: Zap,
  baron: Skull,
  dragon: Flame,
  herald: Shield,
  turret: Castle,
  ward_pink: Eye,
  ward_yellow: Lamp,
  group_up: Users,
  farm_wave: Wheat,
  come_at_me: Swords,
  now_see_here: Glasses,
  does_not_compute: Bot,
  sweating_blitzcrank: Smile,
  unworthy_cn: ThumbsDown,
  gg_heart: Heart,
  bee_happy: Smile,
  bee_mad: Frown,
  thumbs_up: ThumbsUp,
  mind_blown: Sparkles,
  thinking: HelpCircle,
  crown_champ: Crown,
  hundred: CheckCheck,
  flex_muscle: Dumbbell,
  skull_rip: Skull,
  mic_on: Mic,
  mic_off: MicOff,
  vol_boost: Volume2,
  bass_kick: Sliders,
  studio_eq: Headphones,
};

export const PingVectorIcon: FC<PingVectorIconProps> = ({
  iconKey,
  pingId,
  className = "w-4 h-4",
  ...props
}) => {
  const IconComponent =
    (iconKey && ICON_MAP[iconKey]) ||
    (pingId && ID_FALLBACK_MAP[pingId]) ||
    Target;

  return <IconComponent className={className} {...props} />;
};
