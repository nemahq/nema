import { Suspense } from "react";

import { HeaderSkeleton } from "@web/features/memory/components/HeaderSkeleton";
import { ViewSegment } from "@web/features/memory/components/ViewSegment";
import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

function HeaderContent() {
  const { t } = useTranslation();
  const user = useUser();

  return (
    <div className="flex min-h-12 items-center border-b border-border/50 px-6">
      <h1 className="text-base font-semibold">
        {t("memory.page_title", { name: user.displayName })}
      </h1>
      <div className="ml-3">
        <ViewSegment />
      </div>
    </div>
  );
}

export function Header() {
  return (
    <Suspense fallback={<HeaderSkeleton />}>
      <HeaderContent />
    </Suspense>
  );
}
