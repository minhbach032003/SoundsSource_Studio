import { invoke, isTauri } from "@tauri-apps/api/core";

export interface GoogleUser {
  name: string;
  email: string;
  avatar?: string;
}
interface NativeUser { id: string; name: string; email: string; avatar_url?: string | null; }
const profile = (user: NativeUser): GoogleUser => ({ name: user.name, email: user.email, avatar: user.avatar_url || undefined });

export class GoogleAuthState {
  user = $state<GoogleUser | null>(null);
  isLoading = $state(false);
  isLoginModalOpen = $state(false);
  dbStatus = $state("Chưa xác thực phiên máy chủ");
  authProvider = "google";
  private revision = 0;

  constructor() {
    // Mock profiles and bearer tokens from older builds are never authenticated state.
    try { localStorage.removeItem("ss_google_user"); localStorage.removeItem("ss_auth_token"); } catch {}
    if (typeof window !== "undefined" && isTauri()) void this.restore();
  }

  async restore() {
    const revision = this.revision;
    try {
      const user = await invoke<NativeUser | null>("auth_session");
      if (revision !== this.revision) return;
      this.user = user ? profile(user) : null;
      this.dbStatus = user ? "Phiên đã được máy chủ xác thực" : "Chưa đăng nhập";
    } catch {
      if (revision === this.revision) this.dbStatus = "Chưa kết nối máy chủ đăng nhập";
    }
  }

  async signInWithGoogle() {
    if (this.isLoading) return null;
    if (typeof window === "undefined" || !isTauri()) throw new Error("Hãy mở ứng dụng desktop để đăng nhập Google qua trình duyệt.");
    const revision = ++this.revision;
    this.isLoading = true;
    try {
      const user = await invoke<NativeUser>("auth_google_login");
      if (revision !== this.revision) {
        // Close can race with native completion: revoke that late success instead of leaving a hidden session.
        try { await invoke("auth_google_discard_cancelled"); }
        catch { throw new Error("Đã hủy đăng nhập; máy chủ chưa xác nhận thu hồi phiên. Hãy kiểm tra kết nối rồi thử lại."); }
        return null;
      }
      this.user = profile(user);
      this.dbStatus = "Phiên đã được máy chủ xác thực";
      this.isLoginModalOpen = false;
      return this.user;
    } catch (error) {
      if (revision !== this.revision && !(error instanceof Error)) return null;
      throw new Error(typeof error === "string" ? error : error instanceof Error ? error.message : "Không hoàn tất được đăng nhập Google. Hãy thử lại.");
    } finally {
      // Cancellation keeps loading until native work exits; do not start a second browser flow meanwhile.
      this.isLoading = false;
    }
  }

  async cancelLogin() {
    ++this.revision;
    this.isLoginModalOpen = false;
    if (this.isLoading && isTauri()) await invoke("auth_google_cancel");
  }

  async signOut() {
    if (this.isLoading) throw new Error("Hãy hoàn tất hoặc hủy đăng nhập trước.");
    ++this.revision;
    this.isLoading = true;
    try {
      if (!isTauri()) throw new Error("Đăng xuất cần ứng dụng desktop.");
      await invoke("auth_logout");
      this.user = null;
      this.dbStatus = "Chưa đăng nhập";
    } catch {
      throw new Error("Chưa thu hồi được phiên đăng nhập. Kiểm tra kết nối và thử lại.");
    } finally { this.isLoading = false; }
  }
}

export const googleAuthState = new GoogleAuthState();
