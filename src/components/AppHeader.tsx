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
    <header className="flex items-center justify-between pb-4 border-b border-white/8">
      <div className="flex items-center gap-2.5">
        <AppLogo size="sm" variant="with-wordmark" />
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/4 border border-white/8 text-[10px] text-slate-300 font-medium select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] status-pulse" />
          <span>Engine Ready</span>
        </div>

        <ButtonComponent
          id="refresh-btn"
          variant="outline"
          size="icon"
          aria-label="Refresh audio applications"
          title="Refresh applications"
          onClick={onRefresh}
          disabled={isLoading}
          leftIcon={<RefreshCw className={isLoading ? "animate-spin text-sky-400 w-4 h-4" : "text-slate-400 w-4 h-4"} />}
        />
      </div>
    </header>
  );
};
