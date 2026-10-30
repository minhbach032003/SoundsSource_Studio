import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GoogleUser } from "@/lib/googleAuth.svelte";

export interface GoogleCalendarAccount {
  connected: boolean;
  email: string | null;
}

export interface GoogleCalendarEventDto {
  id: string;
  summary: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  duration_minutes: number;
  hangout_link?: string;
  location?: string;
}

export interface CreateCalendarEventPayload {
  summary: string;
  start_time: string; // RFC3339 or "HH:MM"
  end_time: string;   // RFC3339 or "HH:MM"
  description?: string;
  location?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  duration_minutes: number;
  hangout_link?: string;
  location?: string;
  source: "google-calendar";
  is_completed: boolean;
}

const STORAGE_KEY_EVENTS = "ss_gcal_events";
const STORAGE_KEY_COMPLETED = "ss_gcal_completed_ids";
const STORAGE_KEY_LAST_SYNCED = "ss_gcal_last_synced";

export class GoogleCalendarState {
  events = $state<GoogleCalendarEvent[]>([]);
  isLoading = $state(false);
  lastSynced = $state<Date | null>(null);
  isConnected = $state(false);
  accountEmail = $state<string | null>(null);
  error = $state<string | null>(null);

  private completedMap: Record<string, boolean> = {};

  constructor() {
    this.restoreFromStorage();
    if (typeof window !== "undefined" && isTauri()) {
      void this.checkStatus();
    }
  }

  private restoreFromStorage() {
    if (typeof window === "undefined") return;

    try {
      const savedCompleted = localStorage.getItem(STORAGE_KEY_COMPLETED);
      if (savedCompleted) {
        this.completedMap = JSON.parse(savedCompleted);
      }
    } catch {
      this.completedMap = {};
    }

    try {
      const savedEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
      if (savedEvents) {
        const parsed: GoogleCalendarEvent[] = JSON.parse(savedEvents);
        this.events = parsed.map((ev) => ({
          ...ev,
          is_completed: this.completedMap[ev.id] ?? ev.is_completed ?? false,
        }));
      }
    } catch {
      this.events = [];
    }

    try {
      const savedLastSynced = localStorage.getItem(STORAGE_KEY_LAST_SYNCED);
      if (savedLastSynced) {
        this.lastSynced = new Date(savedLastSynced);
      }
    } catch {
      this.lastSynced = null;
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(this.events));
      localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(this.completedMap));
      if (this.lastSynced) {
        localStorage.setItem(STORAGE_KEY_LAST_SYNCED, this.lastSynced.toISOString());
      } else {
        localStorage.removeItem(STORAGE_KEY_LAST_SYNCED);
      }
    } catch (e) {
      console.warn("Failed to persist Google Calendar state:", e);
    }
  }

  async checkStatus(autoSyncIfEmpty = true): Promise<GoogleCalendarAccount> {
    if (typeof window === "undefined" || !isTauri()) {
      return { connected: false, email: null };
    }
    try {
      const res = await invoke<GoogleCalendarAccount>("google_calendar_status");
      this.isConnected = Boolean(res?.connected);
      this.accountEmail = res?.email ?? null;
      if (this.isConnected && autoSyncIfEmpty && this.events.length === 0 && !this.isLoading) {
        void this.syncCalendarInternal().catch(() => {});
      }
      return { connected: this.isConnected, email: this.accountEmail };
    } catch (e) {
      console.warn("Failed to check Google Calendar status:", e);
      this.isConnected = false;
      this.accountEmail = null;
      return { connected: false, email: null };
    }
  }

  async login(): Promise<{ success: boolean; account?: GoogleCalendarAccount; error?: string }> {
    if (typeof window === "undefined" || !isTauri()) {
      const msg = "Hãy mở ứng dụng desktop để kết nối Google Calendar.";
      this.error = msg;
      return { success: false, error: msg };
    }

    this.isLoading = true;
    this.error = null;
    try {
      const account = await invoke<GoogleCalendarAccount>("google_calendar_login");
      this.isConnected = Boolean(account?.connected);
      this.accountEmail = account?.email ?? null;

      // Tự động sync sự kiện hôm nay khi đăng nhập thành công
      try {
        await this.syncCalendarInternal();
      } catch (syncErr) {
        console.warn("Auto-sync after login encountered an issue:", syncErr);
      }

      return { success: true, account };
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "Đăng nhập Google Calendar thất bại";
      this.error = msg;
      return { success: false, error: msg };
    } finally {
      this.isLoading = false;
    }
  }

  async cancelLogin(): Promise<void> {
    if (this.isLoading && typeof window !== "undefined" && isTauri()) {
      try {
        await invoke("google_calendar_cancel");
      } catch (e) {
        console.warn("Failed to cancel Google Calendar login:", e);
      }
    }
    this.isLoading = false;
    this.error = null;
  }

  async syncCalendar(_user?: GoogleUser | null): Promise<{ success: boolean; count: number; error?: string }> {
    if (typeof window === "undefined" || !isTauri()) {
      const msg = "Hãy mở ứng dụng desktop để đồng bộ Google Calendar.";
      this.error = msg;
      return { success: false, count: 0, error: msg };
    }

    this.isLoading = true;
    this.error = null;
    try {
      const res = await this.syncCalendarInternal();
      return res;
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "Không thể đồng bộ Google Calendar";
      this.error = msg;
      return { success: false, count: 0, error: msg };
    } finally {
      this.isLoading = false;
    }
  }

  private async syncCalendarInternal(): Promise<{ success: boolean; count: number; error?: string }> {
    const dtos = await invoke<GoogleCalendarEventDto[]>("google_calendar_sync");
    const mapped: GoogleCalendarEvent[] = (dtos || []).map((dto) => ({
      id: dto.id,
      summary: dto.summary,
      start_time: dto.start_time,
      end_time: dto.end_time,
      duration_minutes: dto.duration_minutes,
      hangout_link: dto.hangout_link || undefined,
      location: dto.location || undefined,
      source: "google-calendar",
      is_completed: Boolean(this.completedMap[dto.id]),
    }));

    this.events = mapped;
    this.lastSynced = new Date();
    this.error = null;
    this.isConnected = true;
    void this.checkStatus();
    this.persist();

    return { success: true, count: mapped.length };
  }

  async createEvent(payload: CreateCalendarEventPayload): Promise<{ success: boolean; event?: GoogleCalendarEvent; error?: string }> {
    if (typeof window === "undefined" || !isTauri()) {
      const msg = "Hãy mở ứng dụng desktop để tạo sự kiện Google Calendar.";
      this.error = msg;
      return { success: false, error: msg };
    }

    if (!payload.summary || !payload.summary.trim()) {
      const msg = "Tiêu đề sự kiện không được để trống.";
      this.error = msg;
      return { success: false, error: msg };
    }

    this.isLoading = true;
    this.error = null;

    try {
      const dto = await invoke<GoogleCalendarEventDto>("google_calendar_create_event", {
        input: {
          summary: payload.summary.trim(),
          start_time: payload.start_time,
          end_time: payload.end_time,
          description: payload.description?.trim() || null,
          location: payload.location?.trim() || null,
        },
      });

      const newEvent: GoogleCalendarEvent = {
        id: dto.id,
        summary: dto.summary,
        start_time: dto.start_time,
        end_time: dto.end_time,
        duration_minutes: dto.duration_minutes,
        hangout_link: dto.hangout_link || undefined,
        location: dto.location || undefined,
        source: "google-calendar",
        is_completed: false,
      };

      // Add to local events list and re-sort by start_time
      const existingWithout = this.events.filter((ev) => ev.id !== newEvent.id);
      this.events = [...existingWithout, newEvent].sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      );
      this.persist();

      return { success: true, event: newEvent };
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "Không thể tạo sự kiện Google Calendar";
      this.error = msg;
      return { success: false, error: msg };
    } finally {
      this.isLoading = false;
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    this.isLoading = true;
    this.error = null;
    try {
      if (typeof window !== "undefined" && isTauri()) {
        await invoke("google_calendar_disconnect");
      }
      this.isConnected = false;
      this.accountEmail = null;
      this.events = [];
      this.lastSynced = null;
      this.completedMap = {};
      this.clear();
      return { success: true };
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "Không thể ngắt kết nối Google Calendar";
      this.error = msg;
      return { success: false, error: msg };
    } finally {
      this.isLoading = false;
    }
  }

  toggleEventComplete(id: string) {
    let nextState = false;
    this.events = this.events.map((ev) => {
      if (ev.id === id) {
        nextState = !ev.is_completed;
        return { ...ev, is_completed: nextState };
      }
      return ev;
    });
    this.completedMap[id] = nextState;
    this.persist();
  }

  deleteEvent(id: string) {
    this.events = this.events.filter((ev) => ev.id !== id);
    this.persist();
  }

  clear() {
    this.events = [];
    this.lastSynced = null;
    this.error = null;
    this.completedMap = {};
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY_EVENTS);
        localStorage.removeItem(STORAGE_KEY_COMPLETED);
        localStorage.removeItem(STORAGE_KEY_LAST_SYNCED);
      } catch {
        // ignore
      }
    }
  }
}

export const googleCalendarState = new GoogleCalendarState();
