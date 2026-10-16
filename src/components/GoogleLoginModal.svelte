<script lang="ts">
  import { googleAuthState } from "@/lib/googleAuth.svelte";
  import { toastState } from "@/lib/toast.svelte";
  import GoogleIcon from "@/components/icons/GoogleIcon.svelte";
  import Modal from "@/components/ui/Modal.svelte";
  import { ExternalLink, ShieldCheck, AlertCircle, Loader2 } from "@lucide/svelte";

  interface Props { open: boolean; onClose: () => void; }
  let { open, onClose }: Props = $props();
  let error = $state<string | null>(null);

  function close() {
    error = null;
    void googleAuthState.cancelLogin().catch(() => toastState.error("Chưa hủy được yêu cầu. Vui lòng đợi đăng nhập hết hạn."));
    onClose();
  }
  async function signIn() {
    error = null;
    try {
      const user = await googleAuthState.signInWithGoogle();
      if (!user) return;
      toastState.success(`Đã đăng nhập Google: ${user.email}`);
      onClose();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Không đăng nhập được. Hãy thử lại.";
      toastState.error(error);
    }
  }
</script>

{#snippet modalIcon()}<GoogleIcon class="w-5 h-5" />{/snippet}
<Modal
  {open}
  onClose={close}
  title="Đăng nhập bằng Google"
  description="Chọn tài khoản trên trang Google trong trình duyệt của bạn."
  confirmText="Tiếp tục với Google"
  cancelText={googleAuthState.isLoading ? "Hủy đăng nhập" : "Để sau"}
  icon={modalIcon}
  onConfirm={signIn}
  isLoading={googleAuthState.isLoading}
  allowCancelWhileLoading
>
  <div class="space-y-3 text-xs leading-relaxed">
    <div class="flex items-start gap-2.5 text-(--ink)">
      <ExternalLink class="w-4 h-4 shrink-0 mt-0.5 text-(--accent)" />
      <p class="m-0">Sau khi xác nhận với Google, quay lại rust-sound. Không cần nhập mật khẩu hay dán token vào ứng dụng.</p>
    </div>
    <p class="m-0 flex items-start gap-2.5 text-(--muted)">
      <ShieldCheck class="w-4 h-4 shrink-0 mt-0.5" />
      <span>Chỉ dùng tên, email và ảnh đại diện. Đăng nhập chưa cấp quyền Google Calendar hoặc Gemini.</span>
    </p>
    {#if googleAuthState.isLoading}
      <div role="status" class="flex items-center gap-2 p-3 rounded-lg border border-(--line) text-(--accent)">
        <Loader2 class="w-4 h-4 motion-safe:animate-spin shrink-0" />
        <span>Đang đợi bạn xác nhận trong trình duyệt…</span>
      </div>
    {/if}
    {#if error}
      <div role="alert" class="flex items-start gap-2 p-3 rounded-lg border border-(--error)/30 text-(--error)">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
      </div>
    {/if}
  </div>
</Modal>
