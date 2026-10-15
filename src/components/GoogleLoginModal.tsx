import { useState, type FC, type FormEvent } from "react";
import {
  ModalComponent,
  InputComponent,
  BadgeComponent,
  useToast,
} from "@/shared/ui";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { Sparkles, Key, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoogleLoginParams } from "@/shared/lib/useGoogleAuth";

export interface GoogleLoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (params: GoogleLoginParams) => Promise<unknown>;
  isLoading?: boolean;
}

const PRESET_ACCOUNTS = [
  {
    name: "Minh Bach",
    email: "minhbach032003@gmail.com",
    avatar:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
    role: "Lead Audio Developer",
  },
  {
    name: "Alex Nguyen",
    email: "alex.nguyen@neon.tech",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
    role: "Neon DB Cloud Architect",
  },
  {
    name: "Studio Sound Engineer",
    email: "sound.engineer@google.com",
    avatar:
      "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80",
    role: "Audio DSP Specialist",
  },
];

export const GoogleLoginModal: FC<GoogleLoginModalProps> = ({
  open,
  onClose,
  onLogin,
  isLoading = false,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"account" | "token">("account");

  // Account Form State
  const [email, setEmail] = useState("minhbach032003@gmail.com");
  const [name, setName] = useState("Minh Bach");
  const [avatarUrl, setAvatarUrl] = useState(PRESET_ACCOUNTS[0].avatar);
  const [idTokenInput, setIdTokenInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSelectPreset = (acc: (typeof PRESET_ACCOUNTS)[0]) => {
    setEmail(acc.email);
    setName(acc.name);
    setAvatarUrl(acc.avatar);
    setValidationError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (activeTab === "account") {
      if (!validateEmail(email)) {
        setValidationError("Vui lòng nhập định dạng email hợp lệ (ví dụ: yourname@gmail.com)");
        return;
      }
      try {
        await onLogin({
          email: email.trim(),
          name: name.trim() || email.split("@")[0],
          avatarUrl,
        });
        showToast("success", `Đăng nhập thành công với tài khoản Google: ${email}`);
        onClose();
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : String(err));
        showToast("error", "Đăng nhập Google thất bại. Vui lòng thử lại.");
      }
    } else {
      if (!idTokenInput.trim() || !idTokenInput.includes(".")) {
        setValidationError("ID Token không đúng định dạng JWT (phải chứa 3 phần cách nhau bởi dấu chấm).");
        return;
      }
      try {
        await onLogin({
          idToken: idTokenInput.trim(),
        });
        showToast("success", "Đã xác thực Google ID Token thành công!");
        onClose();
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : String(err));
        showToast("error", "Xác thực Google ID Token thất bại.");
      }
    }
  };

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title="Đăng Nhập Tài Khoản Google"
      description="Đồng bộ cấu hình âm thanh, lịch Focus Timer và kết nối Gemini Voice AI lên cơ sở dữ liệu đám mây Neon PostgreSQL."
      confirmText={isLoading ? "Đang kết nối…" : "Đăng Nhập"}
      cancelText="Hủy"
      confirmVariant="primary"
      icon={<GoogleIcon className="w-5 h-5" />}
      onConfirm={() => {
        const dummyEvent = { preventDefault: () => {} } as FormEvent;
        handleSubmit(dummyEvent);
      }}
      isLoading={isLoading}
    >
      <div className="space-y-4 pt-1">
        {/* Navigation Tabs */}
        <div className="flex p-0.5 gap-1 bg-[var(--paper)] border border-[var(--line)] rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("account");
              setValidationError(null);
            }}
            className={cn(
              "flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === "account"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Tài Khoản Google</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("token");
              setValidationError(null);
            }}
            className={cn(
              "flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === "token"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <Key className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Google ID Token</span>
          </button>
        </div>

        {/* Tab 1: Account Specification */}
        {activeTab === "account" && (
          <div className="space-y-3.5">
            {/* Quick 1-Click Preset Selector */}
            <div>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-1.5">
                Chọn Nhanh Hồ Sơ Google
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_ACCOUNTS.map((acc) => {
                  const isSelected = email === acc.email;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleSelectPreset(acc)}
                      className={cn(
                        "p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5",
                        isSelected
                          ? "bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--ink)] ring-1 ring-[var(--accent)]/30"
                          : "bg-[var(--paper)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--focus)]"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={acc.avatar}
                          alt={acc.name}
                          className="w-7 h-7 rounded-lg object-cover border border-[var(--line)] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--ink)] m-0 truncate">
                            {acc.name}
                          </p>
                          <p className="text-[10px] text-[var(--muted)] m-0 truncate">
                            {acc.email}
                          </p>
                        </div>
                      </div>

                      <BadgeComponent
                        variant={isSelected ? "default" : "secondary"}
                        className="text-[9px] px-1.5 py-0 shrink-0"
                      >
                        {acc.role}
                      </BadgeComponent>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Inputs */}
            <div className="space-y-2 pt-1 border-t border-[var(--line)]">
              <InputComponent
                label="Địa Chỉ Email Google"
                type="email"
                placeholder="your.email@gmail.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setValidationError(null);
                }}
                disabled={isLoading}
                fullWidth
              />

              <InputComponent
                label="Họ và Tên Hiển Thị"
                type="text"
                placeholder="Họ Tên Của Bạn"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                fullWidth
              />
            </div>

            {/* Cloud & Crypto Badge */}
            <div className="p-2 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>HMAC-SHA256 JWT + Neon DB</span>
              </span>
              <span className="font-mono text-emerald-500 font-semibold">SSL Required</span>
            </div>
          </div>
        )}

        {/* Tab 2: Direct Google ID Token Input */}
        {activeTab === "token" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--ink)] block">
                Google OAuth2 ID Token (JWT)
              </label>
              <textarea
                rows={4}
                value={idTokenInput}
                onChange={(e) => {
                  setIdTokenInput(e.target.value);
                  setValidationError(null);
                }}
                placeholder="Dán Google ID Token (eyJhbGciOiJSUzI1NiIs...) từ Google Cloud Console hoặc OAuth Playground…"
                disabled={isLoading}
                className="w-full p-2.5 rounded-xl bg-[var(--paper)] border border-[var(--input-line)] text-xs font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--focus)] transition-all resize-none"
              />
              <p className="text-[10px] text-[var(--muted)] m-0">
                Token sẽ được xác thực bằng khóa công khai RSA256 của Google và tự động liên kết tài khoản vào cơ sở dữ liệu.
              </p>
            </div>
          </div>
        )}

        {/* Validation or API Error Banner */}
        {validationError && (
          <div className="p-2.5 rounded-xl bg-[var(--error)]/15 border border-[var(--error)]/30 text-[var(--error)] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--error)]" />
            <span className="leading-tight">{validationError}</span>
          </div>
        )}
      </div>
    </ModalComponent>
  );
};
