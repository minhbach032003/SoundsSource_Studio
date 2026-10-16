<script lang="ts">
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { toastState } from "@/lib/toast.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import {
    Cable,
    Download,
    CheckCircle2,
    ExternalLink,
    X,
    AlertTriangle,
  } from "@lucide/svelte";

  export interface VirtualAudioStatusDto {
    is_virtual_device_installed: boolean;
    detected_virtual_devices: string[];
    recommended_input_device: string | null;
    os_name: string;
    setup_guide: string;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let status = $state<VirtualAudioStatusDto | null>(null);
  let copiedKey = $state<string | null>(null);

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  $effect(() => {
    if (!open) return;
    if (isDesktop) {
      invoke<VirtualAudioStatusDto>("get_virtual_audio_status")
        .then((res) => {
          status = res;
        })
        .catch(() => {
          status = {
            is_virtual_device_installed: false,
            detected_virtual_devices: [],
            recommended_input_device: null,
            os_name: "macOS",
            setup_guide: "Install BlackHole driver via Homebrew: brew install blackhole-2ch",
          };
        });
    } else {
      status = {
        is_virtual_device_installed: true,
        detected_virtual_devices: ["BlackHole 2ch (Virtual Cable)"],
        recommended_input_device: "BlackHole 2ch",
        os_name: "macOS",
        setup_guide: "Virtual cable ready for Discord / Zoom routing.",
      };
    }
  });

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      toastState.success("Đã sao chép lệnh cấu hình vào clipboard!");
      setTimeout(() => {
        if (copiedKey === key) copiedKey = null;
      }, 2000);
    } catch {
      toastState.error("Không thể sao chép");
    }
  }

  const detectedName = $derived(
    status?.recommended_input_device ||
      (status?.os_name === "macOS"
        ? "BlackHole 2ch"
        : status?.os_name === "Windows"
        ? "CABLE Output"
        : "Virtual_Sink")
  );

  const installCommand = $derived(
    status?.os_name === "macOS"
      ? "brew install blackhole-2ch"
      : status?.os_name === "Linux"
      ? "pactl load-module module-null-sink sink_name=Virtual_Sink"
      : "https://vb-audio.com/Cable/"
  );

  const driverUrl = $derived(
    status?.os_name === "Windows"
      ? "https://vb-audio.com/Cable/"
      : "https://github.com/ExistentialAudio/BlackHole"
  );
</script>

{#snippet modalIcon()}
  <Cable class="w-5 h-5 text-(--accent)" />
{/snippet}

<Modal
  {open}
  {onClose}
  title="Định Tuyến Micro Ảo (Discord / Zoom / Google Meet)"
  description="Hướng dẫn kết nối luồng âm thanh và giọng nói đã lọc tạp âm sang các ứng dụng gọi thoại của hệ thống."
  confirmText="Đã hiểu & Đóng"
  onConfirm={onClose}
  icon={modalIcon}
  class="sm:max-w-lg"
>
  <div class="space-y-4 pt-2 text-xs">
    <!-- Status Card -->
    <div class="p-3.5 rounded-xl border border-(--line) bg-(--paper) flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        {#if status?.is_virtual_device_installed}
          <CheckCircle2 class="w-5 h-5 text-(--success) shrink-0" />
        {:else}
          <AlertTriangle class="w-5 h-5 text-(--warning) shrink-0" />
        {/if}
        <div>
          <p class="font-bold text-(--ink) m-0">
            {status?.is_virtual_device_installed
              ? "Driver Âm Thanh Ảo Đã Sẵn Sàng"
              : "Chưa Tìm Thấy Driver Âm Thanh Ảo"}
          </p>
          <p class="text-[11px] text-(--muted) m-0 mt-0.5">
            {status?.is_virtual_device_installed
              ? `Đã nhận diện: ${status.detected_virtual_devices.join(", ")}`
              : "Cần cài đặt driver âm thanh ảo để các ứng dụng khác nhận diện luồng mic đã lọc."}
          </p>
        </div>
      </div>
      <span
        class="badge text-[10px] uppercase font-mono shrink-0 {status?.is_virtual_device_installed
          ? 'badge-ok'
          : 'badge-warn'}"
      >
        {status?.os_name || "System"}
      </span>
    </div>

    <!-- Copied Alert Banner -->
    {#if copiedKey}
      <div class="flex items-center justify-between p-2 rounded-lg bg-(--success)/10 border border-(--success)/25 text-(--success) text-[11px]">
        <span>Đã sao chép lệnh cấu hình vào bộ nhớ tạm!</span>
        <button
          type="button"
          onclick={() => { copiedKey = null; }}
          class="p-0.5 hover:opacity-80 rounded cursor-pointer"
          aria-label="Đóng thông báo"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    {/if}

    <!-- 1-Click Install Command (if not installed) -->
    {#if !status?.is_virtual_device_installed}
      <div class="p-3 rounded-xl border border-(--warning)/30 bg-(--warning)/5 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-(--ink) block text-[11px]">
            Lệnh cài đặt driver ảo 1 bước:
          </span>
          <a
            href={driverUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-[10px] text-(--accent) hover:underline"
          >
            <Download class="w-3 h-3" />
            <span>Tải trực tiếp</span>
            <ExternalLink class="w-2.5 h-2.5" />
          </a>
        </div>
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-(--surface) border border-(--line) font-mono text-[11px]">
          <code class="text-(--accent) truncate">
            {installCommand}
          </code>
          <button
            type="button"
            onclick={() => handleCopy(installCommand, "install")}
            class="btn h-6 px-2 text-[10px] font-sans font-semibold shrink-0"
          >
            {copiedKey === "install" ? "Đã chép!" : "Copy"}
          </button>
        </div>
      </div>
    {/if}

    <!-- Step-by-Step App Setup Guide -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="font-bold text-(--ink) block uppercase text-[11px] tracking-wider">
          Cách chọn Microphone trong các ứng dụng:
        </span>
        <a
          href={driverUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-[10px] text-(--muted) hover:text-(--ink) inline-flex items-center gap-1"
        >
          <span>Tài liệu Driver</span>
          <ExternalLink class="w-2.5 h-2.5" />
        </a>
      </div>

      <!-- Discord -->
      <div class="p-2.5 rounded-xl border border-(--line) bg-(--surface) flex items-start justify-between gap-2">
        <div>
          <span class="font-bold text-(--ink) block">1. Discord</span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Vào <strong>Cài đặt người dùng &rarr; Giọng nói & Video &rarr; Thiết bị đầu vào (Input Device)</strong> &rarr; Chọn{" "}
            <span class="text-(--accent) font-semibold font-mono">{detectedName}</span>.
          </span>
        </div>
      </div>

      <!-- Zoom -->
      <div class="p-2.5 rounded-xl border border-(--line) bg-(--surface) flex items-start justify-between gap-2">
        <div>
          <span class="font-bold text-(--ink) block">2. Zoom</span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Vào <strong>Settings &rarr; Audio &rarr; Microphone</strong> &rarr; Chọn{" "}
            <span class="text-(--accent) font-semibold font-mono">{detectedName}</span>.
          </span>
        </div>
      </div>

      <!-- Google Meet -->
      <div class="p-2.5 rounded-xl border border-(--line) bg-(--surface) flex items-start justify-between gap-2">
        <div>
          <span class="font-bold text-(--ink) block">3. Google Meet & Trình duyệt</span>
          <span class="text-[11px] text-(--muted) block mt-0.5">
            Nhấp biểu tượng <strong>Cài đặt cuộc họp (Khác) &rarr; Âm thanh &rarr; Micro</strong> &rarr; Chọn{" "}
            <span class="text-(--accent) font-semibold font-mono">{detectedName}</span>.
          </span>
        </div>
      </div>
    </div>
  </div>
</Modal>
