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

// MARK: - Authentic League of Legends Custom Vector Icons

export const LolDangerIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Tactical Alert Diamond */}
    <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" fillOpacity="0.15" />
    {/* Alert exclamation */}
    <line x1="12" y1="7" x2="12" y2="13" strokeWidth="2.75" />
    <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
    {/* Corner danger ticks */}
    <path d="M12 2l-2 2 M12 2l2 2 M12 22l-2-2 M12 22l2-2" strokeWidth="1.5" />
  </svg>
);

export const LolOmwIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Concentric beacon ripples */}
    <path d="M4 7a7 7 0 0 1 0 10" strokeWidth="1.5" strokeOpacity="0.5" />
    <path d="M2 4a11 11 0 0 1 0 16" strokeWidth="1.5" strokeOpacity="0.3" />
    {/* Forward tactical arrow */}
    <path d="M7 12h13" strokeWidth="2.5" />
    <path d="M14 6l6 6-6 6" strokeWidth="2.5" />
    <circle cx="7" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export const LolAssistIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Tactical beacon ring */}
    <circle cx="12" cy="12" r="9" strokeWidth="1.75" fill="currentColor" fillOpacity="0.12" />
    <circle cx="12" cy="12" r="4" strokeWidth="2" />
    {/* Dual chevron support flags */}
    <path d="M8 8l4 3 4-3" strokeWidth="2" />
    <path d="M8 13l4 3 4-3" strokeWidth="2" />
  </svg>
);

export const LolMissingIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Tactical reticle corners */}
    <path d="M5 2h4 M15 2h4 M2 5v4 M22 5v4 M2 15v4 M22 15v4 M5 22h4 M15 22h4" strokeWidth="1.2" strokeOpacity="0.6" />
    {/* Iconic League Question Mark */}
    <path d="M9.5 8.5a3 3 0 0 1 5.5 1.5c0 2-3 2.5-3 4.5" strokeWidth="2.75" />
    <circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const LolPushIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Triple tactical assault chevrons */}
    <path d="M4 6l6 6-6 6" strokeWidth="2.5" />
    <path d="M10 6l6 6-6 6" strokeWidth="2.5" />
    <path d="M16 6l6 6-6 6" strokeWidth="2.5" />
  </svg>
);

export const LolAllInIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Crossed Duel Blades */}
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
    <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
    {/* Hilts */}
    <path d="M13 19l2-2 M17 15l2-2" strokeWidth="2" />
    <path d="M11 19l-2-2 M7 15l-2-2" strokeWidth="2" />
    {/* Central Clash Impact Spark */}
    <circle cx="12" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const LolNeedVisionIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Tactical Ward Eye */}
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
    <circle cx="12" cy="12" r="3" strokeWidth="2" />
    {/* Vertical Beacon Ray */}
    <line x1="12" y1="2" x2="12" y2="4" strokeWidth="2" />
    <line x1="12" y1="20" x2="12" y2="22" strokeWidth="2" />
  </svg>
);

export const LolEnemyVisionIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Eye with warning target reticle */}
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" strokeWidth="1.75" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    {/* Red warning cross-slash */}
    <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.25" />
  </svg>
);

export const LolRetreatIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeWidth="2" fill="currentColor" fillOpacity="0.12" />
    {/* Downward escape chevron */}
    <path d="M12 8v7 M9 12l3 3 3-3" strokeWidth="2.5" />
  </svg>
);

export const LolBaitIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Tactical Lure / Hook */}
    <circle cx="16" cy="4" r="1.5" strokeWidth="1.5" />
    <path d="M16 5.5v7.5a4.5 4.5 0 0 1-9 0V10a1.5 1.5 0 0 1 3 0v3a1.5 1.5 0 0 0 3 0V5.5" strokeWidth="2.2" />
  </svg>
);

export const LolVisionClearedIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    <path d="M2 13s3.6-5 10-5 10 5 10 5-3.6 5-10 5-10-5-10-5Z" strokeWidth="1.75" />
    <circle cx="12" cy="13" r="2.5" />
    {/* 4-point sparkle star */}
    <path d="M18 2l.7 1.8L20.5 4.5l-1.8.7L18 7l-.7-1.8L15.5 4.5l1.8-.7L18 2Z" fill="currentColor" stroke="none" />
  </svg>
);

export const LolBaronIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Monster Horned Crest */}
    <path d="M4 5c2 3 3 6 3 9 0 4 2 7 5 7s5-3 5-7c0-3 1-6 3-9" strokeWidth="2" fill="currentColor" fillOpacity="0.12" />
    <path d="M7 16l5 3 5-3" strokeWidth="2" />
    {/* Glowing Eyes */}
    <circle cx="9" cy="11" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="11" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const LolDragonIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Elemental Drake Crest */}
    <path d="M12 2c1 3 3 4 5 5-2 2-3 4-3 7 3-1 5-3 6-5-1 6-4 9-8 9s-7-3-8-9c1 2 3 4 6 5 0-3-1-5-3-7 2-1 4-2 5-5z" strokeWidth="2" fill="currentColor" fillOpacity="0.15" />
    <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const LolTurretIcon: FC<LucideProps> = ({ className, size = 20, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...props}
  >
    {/* Fortified Tower Bastion */}
    <path d="M4 21h16 M6 21V9l2-3h8l2 3v12" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
    <path d="M8 6V3h2v2h2V3h2v2h2V3h2v3" strokeWidth="1.5" />
    <path d="M10 14h4v7h-4z" strokeWidth="1.5" />
  </svg>
);

interface PingVectorIconProps extends LucideProps {
  iconKey?: string;
  pingId?: string;
}

const CUSTOM_LOL_MAP: Record<string, FC<LucideProps>> = {
  danger: LolDangerIcon,
  omw: LolOmwIcon,
  assist: LolAssistIcon,
  missing: LolMissingIcon,
  push: LolPushIcon,
  allin: LolAllInIcon,
  needvision: LolNeedVisionIcon,
  enemyvision: LolEnemyVisionIcon,
  retreat: LolRetreatIcon,
  bait: LolBaitIcon,
  visioncleared: LolVisionClearedIcon,
  baron: LolBaronIcon,
  dragon: LolDragonIcon,
  turret: LolTurretIcon,
};

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
  generic: Crosshair,
  target_enemy: Target,
  hold_position: Anchor,
  heal_me: HeartPulse,
  out_of_mana: Droplets,
  ult_ready: Zap,
  herald: Shield,
  minions: Users,
  farm: Wheat,
  ward: Lamp,
  smite: Flame,
};

export const PingVectorIcon: FC<PingVectorIconProps> = ({
  iconKey,
  pingId,
  className,
  size = 18,
  style,
  ...props
}) => {
  // 1. High priority: custom authentic LoL vector SVG icon
  if (pingId && CUSTOM_LOL_MAP[pingId]) {
    const CustomIcon = CUSTOM_LOL_MAP[pingId];
    return <CustomIcon size={size} className={className} style={style} {...props} />;
  }

  // 2. Icon key lookup
  if (iconKey && ICON_MAP[iconKey]) {
    const Icon = ICON_MAP[iconKey];
    return <Icon size={size} className={className} style={style} {...props} />;
  }

  // 3. Fallback map
  if (pingId && ID_FALLBACK_MAP[pingId]) {
    const Icon = ID_FALLBACK_MAP[pingId];
    return <Icon size={size} className={className} style={style} {...props} />;
  }

  // 4. Default generic icon
  return <Crosshair size={size} className={className} style={style} {...props} />;
};
