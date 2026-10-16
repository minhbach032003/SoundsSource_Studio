<script lang="ts">
  interface Props {
    bars?: number;
    active?: boolean;
    class?: string;
  }

  let {
    bars = 3,
    active = true,
    class: className = "",
  }: Props = $props();

  const barCount = $derived(Math.max(1, bars));
  const barArray = $derived(Array.from({ length: barCount }, (_, i) => i));

  // Dynamic bar height and delay presets for bars beyond the default 3
  const DYNAMIC_HEIGHTS = [8, 10, 6, 9, 7];
  const DYNAMIC_DELAYS = [0, 0.4, 0.2, 0.6, 0.3];
</script>

<div
  class="flex items-end gap-0.5 h-2.5 {className}"
  aria-hidden="true"
>
  {#each barArray as i}
    <span
      class="w-0.5 rounded-full bg-(--accent) {active ? 'eq-bar' : 'h-1'}"
      style={bars > 3 ? `height: ${DYNAMIC_HEIGHTS[i % DYNAMIC_HEIGHTS.length]}px; animation-delay: ${DYNAMIC_DELAYS[i % DYNAMIC_DELAYS.length]}s;` : undefined}
    ></span>
  {/each}
</div>
