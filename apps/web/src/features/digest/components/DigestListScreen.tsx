import { NavigationBar } from "@web/components/layout/NavigationBar";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useSourceListWithDigestsSuspenseQuery } from "@web/features/digest/hooks/useSourceListWithDigestsQuery";
import { useMainScrollRestoration } from "@web/hooks/useMainScrollRestoration";
import { useTranslation } from "@web/lib/tolgee";

import { DigestListEmptyState } from "./DigestListEmptyState";
import { SourceDigestGroup } from "./SourceDigestGroup";

const DIGEST_LIST_SCROLL_KEY = "digest-list";

export function DigestListScreen() {
  const { t } = useTranslation();
  const [sources] = useSourceListWithDigestsSuspenseQuery();
  const scrollContainerRef = useMainScrollRestoration(DIGEST_LIST_SCROLL_KEY);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-card">
      <NavigationBar items={[{ label: t("digest.nav_label") }]} />
      <div
        ref={scrollContainerRef}
        data-main-scroll-area
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
          {sources.length === 0 ? (
            <DigestListEmptyState />
          ) : (
            sources.map((source, index) => (
              <SourceDigestGroup
                key={source.sourceId}
                source={source}
                hideDivider={index === sources.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
