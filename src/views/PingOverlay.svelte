<script lang="ts">
  import GlobalPingHost from "@/components/radial/GlobalPingHost.svelte";

  $effect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.classList.remove("bg-(--paper)");
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
  });
</script>

<div class="w-screen h-screen overflow-hidden select-none bg-transparent relative pointer-events-none">
  <GlobalPingHost enabled={true} />
</div>
