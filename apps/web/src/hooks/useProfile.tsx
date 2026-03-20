import { createContext, type ReactNode, useContext, useState } from "react";

import type { Profile } from "@nema-io/shared";

import { OnboardingModal } from "@web/features/profile/components/OnboardingModal";
import { SettingsModal } from "@web/features/profile/components/SettingsModal";
import { trpc } from "@web/lib/trpc";

interface ProfileContext {
  profile: Profile;
  openSettings: () => void;
}

const ProfileContext = createContext<ProfileContext | null>(null);

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { data: profile, isLoading } = trpc.profile.get.useQuery();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) {
    return null;
  }

  const needsOnboarding = !profile;

  return (
    <ProfileContext
      value={
        profile ? { profile, openSettings: () => setSettingsOpen(true) } : null
      }
    >
      {needsOnboarding ? (
        <OnboardingModal />
      ) : (
        <>
          {children}
          <SettingsModal
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            currentContentLanguage={profile.contentLanguage}
          />
        </>
      )}
    </ProfileContext>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
