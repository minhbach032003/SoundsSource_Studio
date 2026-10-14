import type { FC } from "react";
import {
  SlidersHorizontal,
  Timer,
  Mic,
  Bot,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavTab = "mixer" | "timer" | "voice" | "pet" | "settings";

export interface GoogleUser {
  name: string;
  email: string;
  avatar?: string;
}

interface SideNavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: GoogleUser | null;
  isEngineReady?: boolean;
}

interface NavItemConfig {
  id: NavTab;
  label: string;
  icon: typeof SlidersHorizontal;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: "mixer", label: "Mixer", icon: SlidersHorizontal },
  { id: "timer", label: "Focus", icon: Timer },
  { id: "voice", label: "Voice AI", icon: Mic },
  { id: "pet", label: "Agent Pet", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

export const SideNavbar: FC<SideNavbarProps> = ({
  activeTab,
  onSelectTab,
  user,
  isEngineReady = true,
}) => {
  return (
    <aside
      className="w-16 min-w-[64px] h-screen bg-[#0e1218] border-r border-white/8 flex flex-col items-center justify-between py-4 select-none z-30 shrink-0"
      aria-label="App Navigation"
    >
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-5">
        <button
          onClick={() => onSelectTab("mixer")}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center text-slate-950 shadow-[0_2px_12px_rgba(56,189,248,0.4)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          title="SoundsSource Studio"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
            <rect x="2" y="10" width="3" height="4" rx="1.5" fill="currentColor" />
            <rect x="7" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
            <rect x="12" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
            <rect x="17" y="7" width="3" height="10" rx="1.5" fill="currentColor" />
            <rect x="22" y="11" width="3" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>

        {/* Navigation Rail Items */}
        <nav className="flex flex-col items-center gap-2" role="tablist">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                aria-label={item.label}
                title={item.label}
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  "relative w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer group",
                  isActive
                    ? "bg-sky-500/15 text-sky-400 border border-sky-400/35 shadow-[0_0_14px_rgba(56,189,248,0.25)]"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
                )}
              >
                {isActive && (
                  <span
                    className="absolute -left-1.5 w-1 h-6 rounded-r-md bg-sky-400 shadow-[0_0_10px_#38bdf8]"
                    aria-hidden="true"
                  />
                )}
                <Icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span className="text-[9px] font-semibold tracking-tight mt-0.5">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Status */}
      <div className="flex flex-col items-center gap-3">
        {/* Engine Status Dot */}
        <div
          className="flex items-center justify-center w-6 h-6 rounded-full bg-white/4 border border-white/8 cursor-help"
          title={isEngineReady ? "CoreAudio Engine Active" : "CoreAudio Engine Offline"}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isEngineReady
                ? "bg-emerald-500 shadow-[0_0_8px_#10b981] status-pulse"
                : "bg-slate-600"
            )}
          />
        </div>

        {/* User Profile Avatar / Sign In */}
        <button
          onClick={() => onSelectTab("settings")}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden border transition-all cursor-pointer shadow-sm",
            user
              ? "border-sky-400/40 hover:scale-105 hover:border-sky-400"
              : "border-white/10 bg-slate-900/80 text-slate-400 hover:text-white hover:border-white/25"
          )}
          title={user ? `${user.name} (${user.email})` : "Account & Google Sign In"}
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          ) : user ? (
            <span className="text-xs font-bold text-sky-400">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <User className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
};
