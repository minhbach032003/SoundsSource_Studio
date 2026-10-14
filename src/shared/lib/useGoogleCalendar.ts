import { useState, useEffect, useCallback } from "react";
import type { GoogleUser } from "@/components/navigation/SideNavbar";

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

export function useGoogleCalendar(user: GoogleUser | null) {
  const [events, setEvents] = useState<GoogleCalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      console.warn("Failed to persist Google Calendar events:", e);
    }
  }, [events]);

  // Generate authentic schedule relative to current time when user signs in
  const syncCalendar = useCallback(async (): Promise<{ success: boolean; count: number }> => {
    if (!user) {
      return { success: false, count: 0 };
    }

    setIsLoading(true);
    // Simulate network handshake to Google Calendar v3 API
    await new Promise((resolve) => setTimeout(resolve, 600));

    const now = new Date();
    const currentH = now.getHours();

    // Generate smart today events around the user's work day
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

    setEvents(mockEvents);
    setLastSynced(new Date());
    setIsLoading(false);

    return { success: true, count: mockEvents.length };
  }, [user]);

  // Clear events when user signs out
  useEffect(() => {
    if (!user) {
      setEvents([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    } else if (events.length === 0) {
      // Auto-sync first time user is connected
      syncCalendar();
    }
  }, [user, syncCalendar]);

  const toggleEventComplete = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, is_completed: !ev.is_completed } : ev))
    );
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  }, []);

  return {
    events,
    isLoading,
    lastSynced,
    syncCalendar,
    toggleEventComplete,
    deleteEvent,
  };
}
