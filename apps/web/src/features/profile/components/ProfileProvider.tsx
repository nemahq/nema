import { type ReactNode, Suspense, useState } from "react";

import { OnboardingModal } from "@web/features/onboarding";
import { SettingsModal } from "@web/features/settings";

import { ProfileContext } from "../hooks/useProfile";
import { useProfileQuery } from "../hooks/useProfileQuery";

interface ProfileProviderProps {
  children: ReactNode;
}

function ProfileProviderInner({ children }: ProfileProviderProps) {
  const [profile] = useProfileQuery();
  const [settingsOpen, setSettingsOpen] = useState(false);

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

export function ProfileProvider({ children }: ProfileProviderProps) {
  return (
    <Suspense fallback={null}>
      <ProfileProviderInner>{children}</ProfileProviderInner>
    </Suspense>
  );
}
