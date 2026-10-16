<script lang="ts">
  import { formatAssetName, isEmoteId } from "@/lib/pingloom";

  export interface PingBurstItem {
    id: string;
    x: number;
    y: number;
    pingId: string;
    name: string;
    color: string;
    durationMs?: number;
    isEmote?: boolean;
    emoteUrl?: string;
  }

  interface Props {
    burst: PingBurstItem;
    onExpire?: (id: string) => void;
  }

  let { burst, onExpire }: Props = $props();

  let stage = $state<"arrive" | "pulse" | "fade">("arrive");

  const isEmote = $derived(burst.isEmote || isEmoteId(burst.pingId));

  $effect(() => {
    const duration = burst.durationMs ?? 3000;
    const pulseTimer = setTimeout(() => {
      stage = "pulse";
    }, 150);
    const fadeTimer = setTimeout(() => {
      stage = "fade";
    }, Math.max(0, duration - 400));
    const expireTimer = setTimeout(() => {
      onExpire?.(burst.id);
    }, duration);

    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(fadeTimer);
      clearTimeout(expireTimer);
    };
  });
</script>

<div
  style="left: {burst.x}px; top: {burst.y}px;"
  class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-50 flex flex-col items-center justify-center"
>
  <!-- Expanding Harmonic Outer Ring Wave -->
  <div
    class="absolute w-20 h-20 rounded-full border-2 transition-all duration-700 ease-out {stage === 'arrive' ? 'scale-50 opacity-100' : ''} {stage === 'pulse' ? 'scale-150 opacity-40 animate-ping' : ''} {stage === 'fade' ? 'scale-175 opacity-0' : ''}"
    style="border-color: {burst.color};"
  ></div>

  <!-- Secondary Inner Acoustic Ripple -->
  <div
    class="absolute w-12 h-12 rounded-full border transition-all duration-500 ease-out {stage === 'arrive' ? 'scale-75 opacity-80' : ''} {stage === 'pulse' ? 'scale-125 opacity-20' : ''} {stage === 'fade' ? 'scale-140 opacity-0' : ''}"
    style="border-color: {burst.color}; background-color: {burst.color}15;"
  ></div>

  <!-- Center Tactical Ping Diamond or Animated Emote WebP with Spring Pop -->
  {#if isEmote}
    <div
      class="relative flex flex-col items-center justify-center transition-all duration-300 transform spring-burst {stage === 'arrive' ? 'scale-125' : ''} {stage === 'pulse' ? 'scale-100' : ''} {stage === 'fade' ? 'scale-75 opacity-0' : ''}"
      style="filter: drop-shadow(0 0 16px {burst.color}80) drop-shadow(0 4px 14px rgba(0,0,0,0.6));"
    >
      <img
        src={burst.emoteUrl || `/pingloom/emotes/${burst.pingId}.webp`}
        alt={burst.name || formatAssetName(burst.pingId)}
        class="w-16 h-16 object-contain pointer-events-none select-none drop-shadow-lg"
        onerror={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          if (el.src.endsWith(".webp")) {
            el.src = `/pingloom/emotes/${burst.pingId}.png`;
          }
        }}
      />
    </div>
  {:else}
    <div
      class="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-200 transform {stage === 'arrive' ? 'scale-110' : ''} {stage === 'pulse' ? 'scale-100' : ''} {stage === 'fade' ? 'scale-75 opacity-0' : ''}"
      style="background-color: {burst.color}; box-shadow: 0 0 18px {burst.color}80, 0 4px 12px rgba(0,0,0,0.5);"
    >
      <span class="text-white text-[11px] font-black uppercase tracking-wider">
        {burst.name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  {/if}

  <!-- Floating Tactical Label -->
  <span
    class="mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest text-white shadow-md transition-opacity duration-300 {stage === 'fade' ? 'opacity-0' : 'opacity-100'}"
    style="background-color: rgba(15, 12, 18, 0.85); border: 1px solid {burst.color}80; box-shadow: 0 2px 8px rgba(0,0,0,0.6);"
  >
    {burst.name || formatAssetName(burst.pingId)}
  </span>
</div>

<style>
  @keyframes ping-spring-arrive {
    0% {
      transform: scale(0.2);
      opacity: 0;
    }
    45% {
      transform: scale(1.22);
      opacity: 1;
    }
    75% {
      transform: scale(0.92);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .spring-burst {
    animation: ping-spring-arrive 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
</style>
