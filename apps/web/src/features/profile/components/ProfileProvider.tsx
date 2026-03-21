import { type ReactNode, Suspense, useState } from "react";

import { OnboardingModal } from "@web/features/onboarding";
import { ProfileContext } from "@web/features/profile/hooks/useProfile";
import { useProfileQuery } from "@web/features/profile/hooks/useProfileQuery";
import { SettingsModal } from "@web/features/settings";
import { useAuth } from "@web/hooks/useAuth";

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

export function ProfileProvider({ children }: ProfileProviderProps): ReactNode {
  const { session, loading } = useAuth();

  if (loading || !session) {
    return children;
  }

  return (
    <Suspense fallback={null}>
      <ProfileProviderInner>{children}</ProfileProviderInner>
    </Suspense>
  );
}
