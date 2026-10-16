import type { GoogleUser } from "@/lib/googleAuth.svelte";

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

const STORAGE_KEY = "ss_gcal_events";

function formatClock(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export class GoogleCalendarState {
  events = $state<GoogleCalendarEvent[]>([]);
  isLoading = $state(false);
  lastSynced = $state<Date | null>(null);

  constructor() {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        this.events = JSON.parse(saved);
      }
    } catch {
      this.events = [];
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn("Failed to persist Google Calendar events:", e);
    }
  }

  async syncCalendar(user: GoogleUser | null): Promise<{ success: boolean; count: number }> {
    if (!user) {
      return { success: false, count: 0 };
    }

    this.isLoading = true;
    await new Promise((resolve) => setTimeout(resolve, 600));

    const now = new Date();
    const currentH = now.getHours();
    const baseHour = Math.max(9, Math.min(18, currentH));

    const mockEvents: GoogleCalendarEvent[] = [
      {
        id: `gcal-${Date.now()}-1`,
        summary: "CoreAudio Architecture & Sound Routing",
        start_time: formatClock(baseHour - 1 < 0 ? 9 : baseHour - 1, 0),
        end_time: formatClock(baseHour - 1 < 0 ? 9 : baseHour - 1, 45),
        duration_minutes: 45,
        hangout_link: "https://meet.google.com/xyz-aud-core",
        location: "Google Meet",
        source: "google-calendar",
        is_completed: true,
      },
      {
        id: `gcal-${Date.now()}-2`,
        summary: "Deep Work: 10-Band Parametric EQ Calibration",
        start_time: formatClock(baseHour, 15),
        end_time: formatClock(baseHour + 1, 5),
        duration_minutes: 50,
        source: "google-calendar",
        is_completed: false,
      },
      {
        id: `gcal-${Date.now()}-3`,
        summary: "Voice AI Live Protocol & Latency Sync",
        start_time: formatClock(baseHour + 1, 30),
        end_time: formatClock(baseHour + 2, 0),
        duration_minutes: 30,
        hangout_link: "https://meet.google.com/vce-sync-ai",
        location: "Google Meet",
        source: "google-calendar",
        is_completed: false,
      },
      {
        id: `gcal-${Date.now()}-4`,
        summary: "Sprint Retro & Audio Hub Release Standup",
        start_time: formatClock(baseHour + 2, 30),
        end_time: formatClock(baseHour + 3, 15),
        duration_minutes: 45,
        source: "google-calendar",
        is_completed: false,
      },
    ];

    this.events = mockEvents;
    this.lastSynced = new Date();
    this.isLoading = false;
    this.persist();

    return { success: true, count: mockEvents.length };
  }

  toggleEventComplete(id: string) {
    this.events = this.events.map((ev) =>
      ev.id === id ? { ...ev, is_completed: !ev.is_completed } : ev
    );
    this.persist();
  }

  deleteEvent(id: string) {
    this.events = this.events.filter((ev) => ev.id !== id);
    this.persist();
  }

  clear() {
    this.events = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export const googleCalendarState = new GoogleCalendarState();
