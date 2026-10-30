import { invoke, isTauri } from "@tauri-apps/api/core";
import { toastState } from "@/lib/toast.svelte";
import type { GeminiFunctionDeclaration, GeminiToolResult } from "@/lib/geminiAudioTools";

export const DESKTOP_TOOL: GeminiFunctionDeclaration = {
  name: "desktop_action",
  description: "Điều khiển mọi ứng dụng macOS đang chạy có cửa sổ truy cập được, không giới hạn trình duyệt. Gọi list_apps trước để lấy bundle_id đúng; list_apps chỉ đọc, chỉ gửi kind. Thực hiện yêu cầu desktop rõ ràng của người dùng sau khi họ duyệt hộp xác nhận. close_chrome_tab đóng tab đang chọn trong cửa sổ Chrome trước nhất. Các thao tác khác cần bundle_id ứng dụng đang chạy và màn hình được chia sẻ. Không gửi approved hay mã lệnh. Tọa độ x,y chuẩn hóa 0–1000 từ trái/trên màn hình chính.",
  parameters: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: ["list_apps", "close_chrome_tab", "click", "type_text", "press_key", "scroll"] },
      bundle_id: { type: "STRING", description: "Bundle ID chính xác, ví dụ com.google.Chrome, com.apple.TextEdit; không nhắm SoundsSource Studio." },
      x: { type: "NUMBER", description: "Vị trí ngang 0–1000; bắt buộc cho click/scroll." },
      y: { type: "NUMBER", description: "Vị trí dọc 0–1000; bắt buộc cho click/scroll." },
      text: { type: "STRING", description: "type_text: 1–2000 ký tự nguyên văn, không xuống dòng, không mật khẩu." },
      key: { type: "STRING", enum: ["enter", "tab", "escape", "backspace", "left", "right", "down", "up", "space", "cmd+a", "cmd+c", "cmd+v", "cmd+z", "cmd+l", "cmd+t", "cmd+w", "cmd+shift+t"] },
      direction: { type: "STRING", enum: ["up", "down", "left", "right"] },
      amount: { type: "INTEGER", description: "scroll: số dòng nguyên 1–10." },
    },
    required: ["kind"],
  },
};

export interface DesktopApproval { id: string; description: string; target: string }
const desktopFailure = (message: string): GeminiToolResult => ({ ok: false, summary: message, error: message });

export class DesktopController {
  enabled = $state(false);
  busy = $state(false);
  approving = $state(false);
  pending = $state<DesktopApproval | null>(null);
  error = $state<string | null>(null);
  private epoch = 0;
  private lease = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resolve: ((result: GeminiToolResult) => void) | null = null;
  private sync: Promise<unknown> = Promise.resolve();

  private settle(result: GeminiToolResult): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.resolve?.(result);
    this.resolve = null;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const epoch = ++this.epoch;
    this.enabled = false;
    this.lease = "";
    this.error = null;
    this.busy = false;
    this.settle(desktopFailure("Thao tác desktop đã bị hủy."));
    if (!isTauri()) {
      if (enabled) throw new Error("Desktop Control chỉ hoạt động trong ứng dụng macOS.");
      return;
    }
    // Control writes are ordered, so a late enable response cannot undo a stop.
    const sync = this.sync.catch(() => {}).then(() => invoke<string>("desktop_set_enabled", { enabled }));
    this.sync = sync;
    try {
      const lease = await sync;
      if (epoch !== this.epoch) return;
      this.lease = lease;
      this.enabled = enabled;
    } catch (error) {
      if (epoch === this.epoch) this.error = String(error);
      throw error;
    }
  }

  stop(): void { void this.setEnabled(false).catch(() => {}); }
  async cancel(): Promise<void> { await this.setEnabled(false); }

  async run(action: Record<string, unknown>): Promise<GeminiToolResult> {
    if (!this.enabled) return desktopFailure("Desktop Control đang tắt. Người dùng cần bật và duyệt thao tác trong Voice AI.");
    if (this.busy || this.approving) return desktopFailure("Đang chờ xử lý thao tác desktop trước đó.");
    this.busy = true;
    this.error = null;
    const epoch = this.epoch;
    try {
      if (action.kind === "list_apps") {
        if (Object.keys(action).some(key => key !== "kind")) return desktopFailure("list_apps chỉ chấp nhận kind.");
        const apps = await invoke<{ name: string; bundle_id: string }[]>("desktop_list_apps", { lease: this.lease });
        if (epoch !== this.epoch || !this.enabled) return desktopFailure("Phiên điều khiển đã kết thúc.");
        return { ok: true, summary: `Có ${apps.length} ứng dụng desktop đang chạy.`, data: { apps } };
      }
      const approval = await invoke<DesktopApproval>("desktop_prepare", { lease: this.lease, action });
      if (epoch !== this.epoch || !this.enabled) return desktopFailure("Yêu cầu thuộc phiên đã kết thúc.");
      this.pending = approval;
      return await new Promise<GeminiToolResult>((resolve) => {
        this.resolve = resolve;
        this.timer = setTimeout(() => { this.stop(); toastState.info("Xác nhận desktop đã hết hạn; điều khiển đã tắt."); }, 30_000);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (epoch === this.epoch) { this.error = message; toastState.error(message); }
      return desktopFailure(message);
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }

  async approve(): Promise<void> {
    const pending = this.pending;
    if (!pending || !this.enabled || this.approving) return;
    const epoch = this.epoch;
    this.approving = true;
    // Close the modal before activating the target; the backend still rechecks it.
    this.pending = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    try {
      const result = await invoke<{ summary: string; verified: boolean }>("desktop_approve", { id: pending.id });
      if (epoch !== this.epoch) return;
      toastState.success(result.summary);
      this.settle({ ok: true, summary: result.summary, data: { verified: result.verified } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (epoch === this.epoch) {
        this.error = message;
        toastState.error(message);
        this.settle(desktopFailure(message));
      }
    } finally { this.approving = false; }
  }
}
