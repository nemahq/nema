import { Suspense } from "react";

import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { useSourceListWithDigestsSuspenseQuery } from "@web/features/digest/hooks/useSourceListWithDigestsQuery";
import { useMainScrollRestoration } from "@web/hooks/useMainScrollRestoration";

import { DigestListEmptyState } from "./DigestListEmptyState";
import { SourceDigestGroup } from "./SourceDigestGroup";

const DIGEST_LIST_SCROLL_KEY = "digest-list";

interface DigestListBodyProps {
  selectedDigestId: string | null;
  onSelectDigest: (digestId: string) => void;
  onSelectSource: (sourceId: string) => void;
}

function DigestListBodyContent({
  selectedDigestId,
  onSelectDigest,
  onSelectSource,
}: DigestListBodyProps) {
  const [sources] = useSourceListWithDigestsSuspenseQuery();
  const scrollContainerRef = useMainScrollRestoration(DIGEST_LIST_SCROLL_KEY);

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-1 flex-col overflow-y-auto"
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
              selectedDigestId={selectedDigestId}
              onSelectDigest={onSelectDigest}
              onOpenSource={onSelectSource}
            />
          ))
        )}
      </div>
    </div>
  );
}

// NavigationBar(형제)는 이 데이터에 기대지 않는 고정 chrome이라, 로컬 경계를
// 목록 본문에만 둔다 — 헤더까지 함께 서스펜드시키면 화면 전체가 공용 워터마크와
// 다를 바 없어져 로컬 경계를 두는 의미가 없다(apps/web/docs/conventions.md
// Loading 참고).
export function DigestListBody(props: DigestListBodyProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <LoadingWatermark />
        </div>
      }
    >
      <DigestListBodyContent {...props} />
    </Suspense>
  );
}
