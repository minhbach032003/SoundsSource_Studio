import { useState, useEffect } from "react";
import type { GoogleUser } from "@/components/navigation/SideNavbar";

const STORAGE_KEY = "ss_google_user";

export function useGoogleAuth() {
  const [user, setUser] = useState<GoogleUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [user]);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    // Simulate brief authentication handshake
    await new Promise((resolve) => setTimeout(resolve, 600));

    const mockGoogleUser: GoogleUser = {
      name: "Alex Nguyen",
      email: "alex.nguyen@gmail.com",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
    };

    setUser(mockGoogleUser);
    setIsLoading(false);
  };

  const signOut = () => {
    setUser(null);
  };

  return {
    user,
    isLoading,
    signInWithGoogle,
    signOut,
  };
}
