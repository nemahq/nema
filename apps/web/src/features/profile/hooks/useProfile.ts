import { createContext, useContext } from "react";

import type { Profile } from "@nema-io/shared";

interface ProfileContextValue {
  profile: Profile;
  openSettings: () => void;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
