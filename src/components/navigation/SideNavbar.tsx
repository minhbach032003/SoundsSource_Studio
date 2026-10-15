import type { FC } from "react";
import {
  SlidersHorizontal,
  Timer,
  Target,
  Mic,
  Bot,
  Settings,
  User,
} from "lucide-react";
import { AppLogo } from "@/components/icons/AppLogo";
import { cn } from "@/lib/utils";

export type NavTab = "mixer" | "timer" | "pings" | "voice" | "pet" | "settings";

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
  { id: "pings", label: "Pings", icon: Target },
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
      className="w-16 min-w-[64px] h-screen bg-[var(--surface)] border-r border-[var(--line)] flex flex-col items-center justify-between py-4 select-none z-30 shrink-0"
      aria-label="App Navigation"
    >
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-5">
        <button
          onClick={() => onSelectTab("mixer")}
          className="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          title="SoundsSource Studio"
        >
          <AppLogo size="md" variant="icon-only" animated />
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
                    ? "bg-[var(--paper)] text-[var(--ink)] border border-[var(--line)] shadow-sm font-semibold"
                    : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] border border-transparent"
                )}
              >
                {isActive && (
                  <span
                    className="absolute -left-1.5 w-1 h-6 rounded-r-md bg-[var(--accent)]"
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
          className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--paper)] border border-[var(--line)] cursor-help"
          title={isEngineReady ? "CoreAudio Engine Active" : "CoreAudio Engine Offline"}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isEngineReady
                ? "bg-emerald-500 shadow-[0_0_8px_#10b981] status-pulse"
                : "bg-slate-400"
            )}
          />
        </div>

        {/* User Profile Avatar / Sign In */}
        <button
          onClick={() => onSelectTab("settings")}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden border transition-all cursor-pointer shadow-sm",
            user
              ? "border-[var(--accent)] hover:scale-105"
              : "border-[var(--line)] bg-[var(--paper)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--focus)]"
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
            <span className="text-xs font-bold text-[var(--accent)]">
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
