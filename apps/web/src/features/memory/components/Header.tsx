import { Suspense } from "react";
import type { User } from "@supabase/supabase-js";

import { ViewSegment } from "@web/features/memory/components/ViewSegment";
import { useAuth } from "@web/hooks/useAuth";
import { useTranslation } from "@web/lib/tolgee";

function getDisplayName(user: User | null): string {
  if (!user) {
    return "";
  }
  const metadata = user.user_metadata;
  const givenName = metadata?.given_name;
  if (typeof givenName === "string") {
    return givenName;
  }
  const fullName = metadata?.full_name;
  if (typeof fullName === "string") {
    return fullName;
  }
  return user.email ?? "";
}

function HeaderContent() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="flex min-h-12 items-center border-b border-border/50 px-6">
      <h1 className="text-base font-semibold">
        {t("memory.page_title", { name: getDisplayName(user) })}
      </h1>
      <div className="ml-3">
        <ViewSegment />
      </div>
    </div>
  );
}

export function Header() {
  return (
    <Suspense>
      <HeaderContent />
    </Suspense>
  );
}
