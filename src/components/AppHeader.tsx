import type { FC } from "react";
import { RefreshCw } from "lucide-react";
import { ButtonComponent, BadgeComponent } from "@/shared/ui";

interface AppHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
}

export const AppHeader: FC<AppHeaderProps> = ({ onRefresh, isLoading }) => {
  return (
    <header className="flex items-center justify-between pb-4 border-b border-white/8">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-600 to-sky-400 flex items-center justify-center text-slate-950 shadow-[0_2px_10px_rgba(56,189,248,0.35)] shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
            <rect x="2" y="10" width="3" height="4" rx="1.5" fill="currentColor" />
            <rect x="7" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
            <rect x="12" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
            <rect x="17" y="7" width="3" height="10" rx="1.5" fill="currentColor" />
            <rect x="22" y="11" width="3" height="2" rx="1" fill="currentColor" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            SoundsSource
          </span>
          <BadgeComponent variant="default">Studio</BadgeComponent>
        </div>
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
