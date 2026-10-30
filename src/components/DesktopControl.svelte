<script lang="ts">
  import { onDestroy } from "svelte";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { MousePointer2, ShieldCheck, Settings2, Square } from "@lucide/svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import type { DesktopController } from "@/lib/desktopControl.svelte";

  let { controller, available }: { controller: DesktopController; available: boolean } = $props();
  let enableOpen = $state(false);
  let changing = $state(false);
  let permissionBusy = $state(false);
  let permissionMessage = $state("");
  let help = $state(false);

  onDestroy(() => controller.stop());

  async function enable() {
    changing = true;
    try {
      if (!available) throw new Error("Kết nối cuộc gọi có hỗ trợ công cụ trước khi bật Desktop Control.");
      await controller.setEnabled(true);
      enableOpen = false;
      help = true;
      toastState.success("Desktop Control đã bật. Mỗi thao tác vẫn cần bạn duyệt.");
    } catch (error) { toastState.error(String(error)); }
    finally { changing = false; }
  }
  async function cancel() {
    enableOpen = false;
    try { await controller.cancel(); toastState.info("Đã hủy yêu cầu và tắt Desktop Control."); }
    catch (error) { toastState.error(String(error)); }
  }
  async function permission(chrome: boolean) {
    if (!isTauri()) { permissionMessage = "Cấp quyền trong ứng dụng macOS, không phải trình duyệt."; return; }
    permissionBusy = true;
    try {
      const result = await invoke(chrome ? "desktop_request_chrome_permission" : "request_accessibility_permission");
      permissionMessage = !chrome && result !== true
        ? "Bật SoundsSource Studio trong System Settings → Privacy & Security → Accessibility, rồi thử lại."
        : "Đã kiểm tra quyền. Hãy yêu cầu lại thao tác trong cuộc gọi.";
      toastState.info(permissionMessage);
    } catch (error) { permissionMessage = String(error); toastState.error(permissionMessage); }
    finally { permissionBusy = false; }
  }
</script>

<section class="border border-(--line) rounded-lg px-3 py-2 text-xs text-(--ink)" aria-label="Điều khiển desktop">
  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class="btn gap-1.5" aria-pressed={controller.enabled}
      disabled={changing || (!controller.enabled && !available)}
      onclick={() => controller.enabled ? cancel() : (enableOpen = true)}>
      {#if controller.enabled}<Square class="w-4 h-4 text-(--error)" />{:else}<MousePointer2 class="w-4 h-4 text-(--accent-text)" />{/if}
      {controller.enabled ? "Dừng Desktop Control" : "Bật Desktop Control"}
    </button>
    <span class="text-(--muted)" role="status">
      {controller.approving ? "Đang gửi thao tác đã duyệt…" : controller.pending ? "Đang chờ bạn xác nhận" : controller.busy ? "Đang kiểm tra ứng dụng đích…" : controller.enabled ? "Sẵn sàng · chỉ làm sau khi bạn duyệt" : "Đang tắt · cần cuộc gọi hỗ trợ công cụ"}
    </span>
    <button type="button" class="btn" aria-expanded={help} onclick={() => (help = !help)}>
      <Settings2 class="w-4 h-4" /> Quyền & hướng dẫn
    </button>
  </div>
  {#if help}
    <div class="mt-3 space-y-2 text-(--muted)">
      <p>Điều khiển các ứng dụng macOS đang mở, không chỉ trình duyệt: Finder, TextEdit, Notes và các app có cửa sổ truy cập được. AI lấy danh sách app thật trước khi chọn đích. Click, gõ chữ, cuộn và phím tắt cần chia sẻ màn hình chính cùng quyền Accessibility và Screen Recording.</p>
      <p>Ví dụ: “Gõ Xin chào vào ô đang chọn trong TextEdit”, “Cuộn xuống trong Finder”. Riêng “Đóng tab Chrome đang chọn” cần cấp thêm quyền Automation cho Chrome.</p>
      <p>Đọc kỹ ứng dụng và thao tác trong hộp xác nhận. Click/phím tắt có thể gửi hoặc xóa dữ liệu. Không dùng cho mật khẩu, thanh toán hay chạy lệnh terminal. Quyền điều khiển tự tắt khi mất kết nối, rời Voice AI hoặc dừng chia sẻ màn hình.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn" disabled={permissionBusy} onclick={() => permission(true)}>Cấp quyền Chrome</button>
        <button type="button" class="btn" disabled={permissionBusy} onclick={() => permission(false)}>Cấp quyền Accessibility</button>
      </div>
      {#if permissionMessage}<p role="status" class="wrap-anywhere">{permissionMessage}</p>{/if}
    </div>
  {/if}
  {#if controller.error}<p role="alert" class="mt-2 text-(--error) wrap-anywhere">{controller.error}</p>{/if}
</section>

<Modal open={enableOpen} title="Cho phép AI đề xuất thao tác desktop?"
  description="Chỉ bật cho cuộc gọi hiện tại. AI không được tự duyệt: mỗi thao tác đều hiện ứng dụng đích và nội dung để bạn xác nhận. Bạn có thể dừng bất cứ lúc nào; thao tác đã gửi không thể thu hồi."
  confirmText="Bật điều khiển" cancelText="Không bật" onConfirm={enable} onClose={() => (enableOpen = false)} isLoading={changing}>
  {#snippet icon()}<ShieldCheck class="w-5 h-5" />{/snippet}
</Modal>

<Modal open={controller.pending !== null} title="Xác nhận thao tác desktop"
  description="Chỉ duyệt nếu đúng yêu cầu của bạn. Thao tác có thể đóng nội dung chưa lưu, gửi hoặc thay đổi dữ liệu. Xác nhận hết hạn sau 30 giây."
  confirmText="Thực hiện đúng thao tác này" cancelText="Hủy và tắt điều khiển" confirmVariant="destructive"
  onConfirm={() => controller.approve()} onClose={cancel}>
  <div class="max-h-[40vh] overflow-y-auto space-y-3 text-sm">
    <p class="font-semibold wrap-anywhere">{controller.pending?.target}</p>
    <p class="whitespace-pre-wrap wrap-anywhere">{controller.pending?.description}</p>
  </div>
</Modal>
