import type { FC } from "react";
import { RefreshCw } from "lucide-react";
import { ButtonComponent } from "@/shared/ui";
import { AppLogo } from "@/components/icons/AppLogo";

interface AppHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
}

export const AppHeader: FC<AppHeaderProps> = ({ onRefresh, isLoading }) => {
  return (
    <header className="flex items-center justify-between pb-3 border-b border-[var(--line)] bg-[var(--paper)]">
      <div className="flex items-center gap-2.5">
        <AppLogo size="sm" variant="with-wordmark" />
      </div>

      <div className="flex items-center gap-3">
        <div className="status-indicator">
          <span className="status-dot"></span>
          <span className="text-[11px] font-medium text-[var(--success)]">CoreAudio Active</span>
        </div>

        <ButtonComponent
          id="refresh-btn"
          variant="outline"
          size="icon"
          aria-label="Refresh audio applications"
          title="Refresh applications"
          onClick={onRefresh}
          disabled={isLoading}
          leftIcon={<RefreshCw className={isLoading ? "animate-spin text-[var(--accent)] w-4 h-4" : "text-[var(--muted)] w-4 h-4"} />}
        />
      </div>
    </header>
  );
};
