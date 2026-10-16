<script lang="ts">
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
  } from "@lucide/svelte";
  import type { Component } from "svelte";
  import { DEFAULT_CATALOG } from "@/lib/pingloom";

  interface Props {
    assetId?: string;
    pingId?: string;
    iconKey?: string;
    className?: string;
    class?: string;
    size?: number;
    style?: string;
  }

  let {
    assetId = "",
    pingId = "",
    iconKey = "",
    className = "",
    class: classProp = "",
    size = 18,
    style = "",
  }: Props = $props();

  const ICON_MAP: Record<string, Component<any>> = {
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

  const ID_FALLBACK_MAP: Record<string, Component<any>> = {
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

  const CUSTOM_LOL_IDS = new Set([
    "danger",
    "omw",
    "assist",
    "missing",
    "push",
    "allin",
    "needvision",
    "enemyvision",
    "retreat",
    "bait",
    "visioncleared",
    "baron",
    "dragon",
    "turret",
  ]);

  const effectiveId = $derived(assetId || pingId || "");
  const effectiveClass = $derived([className, classProp].filter(Boolean).join(" "));
  const isCustomLol = $derived(CUSTOM_LOL_IDS.has(effectiveId));

  const ResolvedLucideIcon = $derived.by(() => {
    if (iconKey && ICON_MAP[iconKey]) {
      return ICON_MAP[iconKey];
    }
    if (effectiveId) {
      const entry = DEFAULT_CATALOG.find((c) => c.id === effectiveId);
      if (entry?.vectorIcon && ICON_MAP[entry.vectorIcon]) {
        return ICON_MAP[entry.vectorIcon];
      }
      if (ID_FALLBACK_MAP[effectiveId]) {
        return ID_FALLBACK_MAP[effectiveId];
      }
    }
    return Crosshair;
  });
</script>

{#if isCustomLol}
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={effectiveClass}
    {style}
  >
    {#if effectiveId === "danger"}
      <!-- Tactical Alert Diamond -->
      <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" fill-opacity="0.15" />
      <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.75" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 2l-2 2 M12 2l2 2 M12 22l-2-2 M12 22l2-2" stroke-width="1.5" />
    {:else if effectiveId === "omw"}
      <!-- Concentric beacon ripples -->
      <path d="M4 7a7 7 0 0 1 0 10" stroke-width="1.5" stroke-opacity="0.5" />
      <path d="M2 4a11 11 0 0 1 0 16" stroke-width="1.5" stroke-opacity="0.3" />
      <path d="M7 12h13" stroke-width="2.5" />
      <path d="M14 6l6 6-6 6" stroke-width="2.5" />
      <circle cx="7" cy="12" r="1.5" fill="currentColor" />
    {:else if effectiveId === "assist"}
      <!-- Tactical beacon ring -->
      <circle cx="12" cy="12" r="9" stroke-width="1.75" fill="currentColor" fill-opacity="0.12" />
      <circle cx="12" cy="12" r="4" stroke-width="2" />
      <path d="M8 8l4 3 4-3" stroke-width="2" />
      <path d="M8 13l4 3 4-3" stroke-width="2" />
    {:else if effectiveId === "missing"}
      <!-- Tactical reticle corners & LoL question mark -->
      <path d="M5 2h4 M15 2h4 M2 5v4 M22 5v4 M2 15v4 M22 15v4 M5 22h4 M15 22h4" stroke-width="1.2" stroke-opacity="0.6" />
      <path d="M9.5 8.5a3 3 0 0 1 5.5 1.5c0 2-3 2.5-3 4.5" stroke-width="2.75" />
      <circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none" />
    {:else if effectiveId === "push"}
      <!-- Triple tactical assault chevrons -->
      <path d="M4 6l6 6-6 6" stroke-width="2.5" />
      <path d="M10 6l6 6-6 6" stroke-width="2.5" />
      <path d="M16 6l6 6-6 6" stroke-width="2.5" />
    {:else if effectiveId === "allin"}
      <!-- Crossed Duel Blades -->
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke-width="2" fill="currentColor" fill-opacity="0.1" />
      <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" stroke-width="2" fill="currentColor" fill-opacity="0.1" />
      <path d="M13 19l2-2 M17 15l2-2" stroke-width="2" />
      <path d="M11 19l-2-2 M7 15l-2-2" stroke-width="2" />
      <circle cx="12" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
    {:else if effectiveId === "needvision"}
      <!-- Tactical Ward Eye -->
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" stroke-width="2" fill="currentColor" fill-opacity="0.1" />
      <circle cx="12" cy="12" r="3" stroke-width="2" />
      <line x1="12" y1="2" x2="12" y2="4" stroke-width="2" />
      <line x1="12" y1="20" x2="12" y2="22" stroke-width="2" />
    {:else if effectiveId === "enemyvision"}
      <!-- Eye with warning reticle and slash -->
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" stroke-width="1.75" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <line x1="3" y1="3" x2="21" y2="21" stroke-width="2.25" />
    {:else if effectiveId === "retreat"}
      <!-- Downward escape shield & chevron -->
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2" fill="currentColor" fill-opacity="0.12" />
      <path d="M12 8v7 M9 12l3 3 3-3" stroke-width="2.5" />
    {:else if effectiveId === "bait"}
      <!-- Tactical Lure / Hook -->
      <circle cx="16" cy="4" r="1.5" stroke-width="1.5" />
      <path d="M16 5.5v7.5a4.5 4.5 0 0 1-9 0V10a1.5 1.5 0 0 1 3 0v3a1.5 1.5 0 0 0 3 0V5.5" stroke-width="2.2" />
    {:else if effectiveId === "visioncleared"}
      <!-- Cleared eye & 4-point sparkle star -->
      <path d="M2 13s3.6-5 10-5 10 5 10 5-3.6 5-10 5-10-5-10-5Z" stroke-width="1.75" />
      <circle cx="12" cy="13" r="2.5" />
      <path d="M18 2l.7 1.8L20.5 4.5l-1.8.7L18 7l-.7-1.8L15.5 4.5l1.8-.7L18 2Z" fill="currentColor" stroke="none" />
    {:else if effectiveId === "baron"}
      <!-- Monster Horned Crest -->
      <path d="M4 5c2 3 3 6 3 9 0 4 2 7 5 7s5-3 5-7c0-3 1-6 3-9" stroke-width="2" fill="currentColor" fill-opacity="0.12" />
      <path d="M7 16l5 3 5-3" stroke-width="2" />
      <circle cx="9" cy="11" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.3" fill="currentColor" stroke="none" />
    {:else if effectiveId === "dragon"}
      <!-- Elemental Drake Crest -->
      <path d="M12 2c1 3 3 4 5 5-2 2-3 4-3 7 3-1 5-3 6-5-1 6-4 9-8 9s-7-3-8-9c1 2 3 4 6 5 0-3-1-5-3-7 2-1 4-2 5-5z" stroke-width="2" fill="currentColor" fill-opacity="0.15" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
    {:else if effectiveId === "turret"}
      <!-- Fortified Tower Bastion -->
      <path d="M4 21h16 M6 21V9l2-3h8l2 3v12" stroke-width="2" fill="currentColor" fill-opacity="0.1" />
      <path d="M8 6V3h2v2h2V3h2v2h2V3h2v3" stroke-width="1.5" />
      <path d="M10 14h4v7h-4z" stroke-width="1.5" />
    {/if}
  </svg>
{:else}
  <ResolvedLucideIcon {size} class={effectiveClass} {style} />
{/if}
