import { Suspense, useRef } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

import { Button, Text } from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useSourceListWithDigestsInfiniteQuery } from "@web/features/digest/hooks/useSourceListWithDigestsQuery";
import { useIntersectionEffect } from "@web/hooks/useIntersectionEffect";
import { useMainScrollRestoration } from "@web/hooks/useMainScrollRestoration";
import { useTranslation } from "@web/lib/tolgee";

import { DigestListEmptyState } from "./DigestListEmptyState";
import { DigestListSkeleton } from "./DigestListSkeleton";
import { SourceDigestGroup } from "./SourceDigestGroup";

const DIGEST_LIST_SCROLL_KEY = "digest-list";
const DIGEST_LIST_INITIAL_SKELETON_COUNT = 3;
const DIGEST_LIST_NEXT_PAGE_SKELETON_COUNT = 1;

interface DigestListBodyProps {
  selectedDigestId: string | null;
  onSelectSource: (sourceId: string) => void;
}

interface DigestListNextPageErrorProps {
  onRetry: () => void;
}

function DigestListNextPageError({ onRetry }: DigestListNextPageErrorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-4">
      <Button variant="neutral" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" />
        {t("common.retry")}
      </Button>
    </div>
  );
}

function DigestListBodyContent({
  selectedDigestId,
  onSelectSource,
}: DigestListBodyProps) {
  const { t } = useTranslation();
  const [sourcePages, query] = useSourceListWithDigestsInfiniteQuery();
  const scrollContainerRef = useMainScrollRestoration(DIGEST_LIST_SCROLL_KEY);
  const sources = sourcePages.pages.flatMap((page) => page.items);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // isFetchNextPageError일 땐 관성 스크롤로 sentinel이 계속 화면에 남아 있는
  // 채라, 껐다 켜지 않으면 실패 즉시 같은 요청을 무한 반복한다 — "다시 시도"
  // 버튼으로만 재시도하게 여기서 끈다.
  useIntersectionEffect({
    ref: sentinelRef,
    onIntersect: query.fetchNextPage,
    enabled:
      query.hasNextPage &&
      !query.isFetchingNextPage &&
      !query.isFetchNextPageError,
  });

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        {sources.length === 0 ? (
          <DigestListEmptyState />
        ) : (
          <>
            {sources.map((source) => (
              <SourceDigestGroup
                key={source.sourceId}
                source={source}
                selectedDigestId={selectedDigestId}
                onOpenSource={onSelectSource}
              />
            ))}
            {query.hasNextPage ? (
              <div ref={sentinelRef} className="flex flex-col">
                {query.isFetchingNextPage && (
                  <DigestListSkeleton
                    count={DIGEST_LIST_NEXT_PAGE_SKELETON_COUNT}
                  />
                )}
                {/* isFetchingNextPage 가드 — 재시도 버튼을 눌러 새 요청이
                    나가는 동안에도 이전 실패의 isFetchNextPageError가 요청이
                    끝날 때까지 그대로라, 안 걸면 스켈레톤과 재시도 버튼이
                    잠깐 같이 뜬다. */}
                {query.isFetchNextPageError && !query.isFetchingNextPage && (
                  <DigestListNextPageError
                    onRetry={() => query.fetchNextPage()}
                  />
                )}
              </div>
            ) : (
              <Text size="xs" color="tertiary" className="py-4 text-center">
                {t("common.list_end")}
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface DigestListErrorFallbackProps extends ErrorFallbackProps {
  resetQueryError: () => void;
}

function DigestListErrorFallback({
  resetQueryError,
  ...fallbackProps
}: DigestListErrorFallbackProps) {
  return (
    <SectionErrorFallback
      {...fallbackProps}
      reset={() => {
        resetQueryError();
        fallbackProps.reset();
      }}
    />
  );
}

// NavigationBar(형제)는 이 데이터에 기대지 않는 고정 chrome이라, 로컬 경계를
// 목록 본문에만 둔다(apps/web/docs/conventions.md Loading 참고). 첫 페이지
// 실패는 여기로 던져져 목록 전체가 에러 화면이 되지만(보여줄 게 없으니 맞다),
// 다음 페이지 실패는 useSuspenseInfiniteQuery가 이미 성공한 data를 유지한 채
// isFetchNextPageError만 세워서 여기까지 안 올라온다 — 이미 본 것은 그대로
// 남고 DigestListNextPageError만 보여줄 수 있다(TanStack Query v5
// defaultThrowOnError: query.state.data === undefined일 때만 던짐).
export function DigestListBody(props: DigestListBodyProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset: resetQueryError }) => (
        <ErrorBoundary
          boundaryName="digest-list"
          fallbackRender={(fallbackProps) => (
            <DigestListErrorFallback
              {...fallbackProps}
              resetQueryError={resetQueryError}
            />
          )}
        >
          <Suspense
            fallback={
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
                <DigestListSkeleton
                  count={DIGEST_LIST_INITIAL_SKELETON_COUNT}
                />
              </div>
            }
          >
            <DigestListBodyContent {...props} />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
