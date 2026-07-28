import { Suspense } from "react";

import { Skeleton, Text } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useSourceContentSuspenseQuery } from "@web/features/review/hooks/useSourceContentQuery";
import { useTranslation } from "@web/lib/tolgee";

interface RelationJudgmentSourceTabContentProps {
  sourceId: string;
  // sources.title은 null일 수 있다 — 그 Source에서 나온 Digest의 제목으로 대신한다.
  fallbackTitle: string;
}

function RelationJudgmentSourceTabContent({
  sourceId,
  fallbackTitle,
}: RelationJudgmentSourceTabContentProps) {
  const [source] = useSourceContentSuspenseQuery(sourceId);

  return (
    <div className="flex flex-col gap-3 p-4">
      <Text as="h2" size="lg" weight="semibold">
        {source.title ?? fallbackTitle}
      </Text>
      <Text as="p" size="sm" color="secondary" className="whitespace-pre-wrap">
        {source.body}
      </Text>
    </div>
  );
}

interface RelationJudgmentSourceTabProps {
  sourceId: string;
  fallbackTitle: string;
}

export function RelationJudgmentSourceTab({
  sourceId,
  fallbackTitle,
}: RelationJudgmentSourceTabProps) {
  const { t } = useTranslation();

  return (
    <ErrorBoundary
      boundaryName="relation-judgment-source-tab"
      fallbackRender={() => (
        <div className="p-4">
          <Text color="tertiary">{t("review.detail_refresh_failed")}</Text>
        </div>
      )}
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <RelationJudgmentSourceTabContent
          sourceId={sourceId}
          fallbackTitle={fallbackTitle}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
