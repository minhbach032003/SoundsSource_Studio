import { useState, useEffect, type FC } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ModalComponent, BadgeComponent, useToast } from "@/shared/ui";
import {
  Cable,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export interface VirtualAudioStatusDto {
  is_virtual_device_installed: boolean;
  detected_virtual_devices: string[];
  recommended_input_device: string | null;
  os_name: string;
  setup_guide: string;
}

interface VirtualCableModalProps {
  open: boolean;
  onClose: () => void;
}

export const VirtualCableModal: FC<VirtualCableModalProps> = ({ open, onClose }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<VirtualAudioStatusDto | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isDesktop =
    typeof window !== "undefined" &&
    (isTauri() ||
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  useEffect(() => {
    if (!open) return;
    if (isDesktop) {
      invoke<VirtualAudioStatusDto>("get_virtual_audio_status")
        .then((res) => setStatus(res))
        .catch(() => {
          setStatus({
            is_virtual_device_installed: false,
            detected_virtual_devices: [],
            recommended_input_device: null,
            os_name: "macOS",
            setup_guide: "Install BlackHole driver via Homebrew: brew install blackhole-2ch",
          });
        });
    } else {
      setStatus({
        is_virtual_device_installed: true,
        detected_virtual_devices: ["BlackHole 2ch (Virtual Cable)"],
        recommended_input_device: "BlackHole 2ch",
        os_name: "macOS",
        setup_guide: "Virtual cable ready for Discord / Zoom routing.",
      });
    }
  }, [open, isDesktop]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast("success", "Đã sao chép lệnh cấu hình vào clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const detectedName =
    status?.recommended_input_device ||
    (status?.os_name === "macOS"
      ? "BlackHole 2ch"
      : status?.os_name === "Windows"
      ? "CABLE Output"
      : "Virtual_Sink");

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title="Định Tuyến Micro Ảo (Discord / Zoom / Google Meet)"
      icon={<Cable className="w-5 h-5 text-[var(--accent)]" />}
      description="Hướng dẫn kết nối luồng âm thanh và giọng nói đã lọc tạp âm sang các ứng dụng gọi thoại của hệ thống."
      confirmText="Đã hiểu & Đóng"
      onConfirm={onClose}
    >
      <div className="space-y-4 pt-2 text-xs">
        {/* Status Card */}
        <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {status?.is_virtual_device_installed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            <div>
              <p className="font-bold text-[var(--ink)] m-0">
                {status?.is_virtual_device_installed
                  ? "Driver Âm Thanh Ảo Đã Sẵn Sàng"
                  : "Chưa Tìm Thấy Driver Âm Thanh Ảo"}
              </p>
              <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5">
                {status?.is_virtual_device_installed
                  ? `Đã nhận diện: ${status.detected_virtual_devices.join(", ")}`
                  : `Cần cài đặt driver âm thanh ảo để các ứng dụng khác nhận diện luồng mic đã lọc.`}
              </p>
            </div>
          </div>
          <BadgeComponent
            variant={status?.is_virtual_device_installed ? "default" : "secondary"}
            className="text-[10px] uppercase font-mono shrink-0"
          >
            {status?.os_name || "System"}
          </BadgeComponent>
        </div>

        {/* 1-Click Install Command (if not installed) */}
        {!status?.is_virtual_device_installed && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
            <span className="font-bold text-[var(--ink)] block text-[11px]">
              Lệnh cài đặt driver ảo 1 bước:
            </span>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] font-mono text-[11px]">
              <code className="text-[var(--accent)] truncate">
                {status?.os_name === "macOS"
                  ? "brew install blackhole-2ch"
                  : status?.os_name === "Linux"
                  ? "pactl load-module module-null-sink sink_name=Virtual_Sink"
                  : "https://vb-audio.com/Cable/"}
              </code>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    status?.os_name === "macOS"
                      ? "brew install blackhole-2ch"
                      : status?.os_name === "Linux"
                      ? "pactl load-module module-null-sink sink_name=Virtual_Sink"
                      : "https://vb-audio.com/Cable/",
                    "install"
                  )
                }
                className="px-2 py-1 rounded bg-[var(--paper)] border border-[var(--line)] hover:border-[var(--focus)] text-[10px] font-sans font-semibold cursor-pointer shrink-0"
              >
                {copiedKey === "install" ? "Đã chép!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Step-by-Step App Setup Guide */}
        <div className="space-y-2.5">
          <span className="font-bold text-[var(--ink)] block uppercase text-[11px] tracking-wider">
            Cách chọn Microphone trong các ứng dụng:
          </span>

          {/* Discord */}
          <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-start justify-between gap-2">
            <div>
              <span className="font-bold text-[var(--ink)] block">1. Discord</span>
              <span className="text-[11px] text-[var(--muted)] block mt-0.5">
                Vào <strong>Cài đặt người dùng ➔ Giọng nói & Video ➔ Thiết bị đầu vào (Input Device)</strong> ➔ Chọn{" "}
                <span className="text-[var(--accent)] font-semibold font-mono">{detectedName}</span>.
              </span>
            </div>
          </div>

          {/* Zoom */}
          <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-start justify-between gap-2">
            <div>
              <span className="font-bold text-[var(--ink)] block">2. Zoom</span>
              <span className="text-[11px] text-[var(--muted)] block mt-0.5">
                Vào <strong>Settings ➔ Audio ➔ Microphone</strong> ➔ Chọn{" "}
                <span className="text-[var(--accent)] font-semibold font-mono">{detectedName}</span>.
              </span>
            </div>
          </div>

          {/* Google Meet */}
          <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-start justify-between gap-2">
            <div>
              <span className="font-bold text-[var(--ink)] block">3. Google Meet & Trình duyệt</span>
              <span className="text-[11px] text-[var(--muted)] block mt-0.5">
                Nhấp biểu tượng <strong>Cài đặt cuộc họp (Khác) ➔ Âm thanh ➔ Micro</strong> ➔ Chọn{" "}
                <span className="text-[var(--accent)] font-semibold font-mono">{detectedName}</span>.
              </span>
            </div>
          </div>
        </div>
      </div>
    </ModalComponent>
  );
};
