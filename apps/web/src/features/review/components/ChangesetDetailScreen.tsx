import { Suspense, useEffect } from "react";

import { GetChangesetByNumberInputSchema } from "@nema-io/shared";

import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { NavigationBar } from "@web/components/layout/NavigationBar";
import { isChangesetNotFound } from "@web/features/review/changesetErrors";
import { ChangesetNotFound } from "@web/features/review/components/ChangesetNotFound";
import { ClosedReviewScreen } from "@web/features/review/components/ClosedReviewScreen";
import { OpenReviewScreen } from "@web/features/review/components/OpenReviewScreen";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import type { ChangesetStatus } from "@web/features/review/types";
import { useSpaceListSuspenseQuery } from "@web/features/workspace";
import { trpc } from "@web/lib/trpc";

interface ChangesetDetailScreenProps {
  spacePublicId: string;
  changesetNumber: string;
}

function ChangesetDetailNavSkeleton() {
  return <NavigationBar />;
}

interface ChangesetDetailRouterProps {
  spacePublicId: string;
  spaceId: string;
  number: number;
}

// changesetStatusMeta(constants.ts)와 같은 이유로 if/else 대신 Record를 쓴다 —
// status에 값이 추가되면 여기서 컴파일 에러로 드러나야, 조용히 Closed로 잘못
// 분류되는 걸 막는다.
const CHANGESET_DETAIL_SCREEN_KIND: Record<ChangesetStatus, "open" | "closed"> =
  {
    pending: "open",
    applied: "closed",
    rejected: "closed",
  };

// GitHub의 PR 페이지(merge 여부와 무관하게 /pull/123 URL 그대로)를 참고한 패턴 —
// pending이면 편집 가능한 리뷰 화면, 아니면 읽기전용 기록 화면을 같은 URL에서 그린다.
// 두 화면을 하나로 합치지 않는 이유: 편집 중인 초안 vs 확정된 기록은 성격이 달라
// 각자의 쿼리·상태를 그대로 유지하는 편이 낫다(이 게이트는 어느 쪽을 보여줄지만 정한다).
function ChangesetDetailRouter({
  spacePublicId,
  spaceId,
  number,
}: ChangesetDetailRouterProps) {
  const [changesetDetail] = useChangesetDetailSuspenseQuery(spaceId, number);

  if (CHANGESET_DETAIL_SCREEN_KIND[changesetDetail.status] === "open") {
    return (
      <OpenReviewScreen
        spacePublicId={spacePublicId}
        spaceId={spaceId}
        number={number}
      />
    );
  }
  return (
    <ClosedReviewScreen
      spacePublicId={spacePublicId}
      spaceId={spaceId}
      number={number}
    />
  );
}

interface ChangesetDetailErrorFallbackProps extends ErrorFallbackProps {
  spaceId: string;
  number: number;
}

// digestReview.get 같은 하위 쿼리가 NOT_FOUND를 던진 경우, changeset 자체가 사라진
// 게 아니라 다른 탭·리뷰어·MCP가 방금 확정·버려서 status만 바뀐 것일 수 있다.
// changeset.getByNumber를 한 번 재검증해 여전히 존재하면 Router가 자연히 Closed로
// 넘어가고, 재검증 후에도(hasRetried) NOT_FOUND면 그때만 진짜 없는 것으로 본다.
function ChangesetDetailErrorFallback({
  error,
  reset,
  hasRetried,
  spaceId,
  number,
}: ChangesetDetailErrorFallbackProps) {
  const utils = trpc.useUtils();
  const notFound = isChangesetNotFound(error);

  useEffect(
    function retryOnceBeforeNotFound() {
      if (notFound && !hasRetried) {
        void utils.changeset.getByNumber
          .invalidate({ spaceId, number })
          .then(reset);
      }
    },
    [notFound, hasRetried, spaceId, number, reset, utils],
  );

  if (notFound && !hasRetried) {
    return <ChangesetDetailNavSkeleton />;
  }
  if (notFound) {
    return <ChangesetNotFound />;
  }
  return (
    <SectionErrorFallback error={error} reset={reset} hasRetried={hasRetried} />
  );
}

function ChangesetDetailSpaceGate({
  spacePublicId,
  changesetNumber,
}: ChangesetDetailScreenProps) {
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );
  const number = Number(changesetNumber);
  const numberIsValid =
    GetChangesetByNumberInputSchema.shape.number.safeParse(number).success;

  if (!space || !numberIsValid) {
    return <ChangesetNotFound />;
  }

  return (
    <ErrorBoundary
      boundaryName="changeset-detail"
      shouldReport={(error) => !isChangesetNotFound(error)}
      fallbackRender={(props) => (
        <ChangesetDetailErrorFallback
          {...props}
          spaceId={space.id}
          number={number}
        />
      )}
    >
      <Suspense fallback={<ChangesetDetailNavSkeleton />}>
        <ChangesetDetailRouter
          spacePublicId={spacePublicId}
          spaceId={space.id}
          number={number}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

export function ChangesetDetailScreen({
  spacePublicId,
  changesetNumber,
}: ChangesetDetailScreenProps) {
  return (
    <div className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<ChangesetDetailNavSkeleton />}>
        <ChangesetDetailSpaceGate
          spacePublicId={spacePublicId}
          changesetNumber={changesetNumber}
        />
      </Suspense>
    </div>
  );
}
