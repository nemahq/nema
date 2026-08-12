import { Suspense, useEffect } from "react";

import { GetChangesetByNumberInputSchema } from "@nema-io/shared";

import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { isChangesetNotFound } from "@web/features/review/changesetErrors";
import { ChangesetDetailLayoutSkeleton } from "@web/features/review/components/ChangesetDetailLayoutSkeleton";
import { renderChangesetDetailScreen } from "@web/features/review/components/changesetDetailRegistry";
import { ChangesetNotFound } from "@web/features/review/components/ChangesetNotFound";
import { ChangesetSidePanelProvider } from "@web/features/review/components/ChangesetSidePanelProvider";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useSpaceListSuspenseQuery } from "@web/hooks/useSpaceList";
import { useSpacePublicId } from "@web/hooks/useSpacePublicId";
import { trpc } from "@web/lib/trpc";

// 라우트 파라미터 그대로 — 숫자 변환·검증 전이라 changesetNumber가 문자열이다.
interface ChangesetDetailRouteProps {
  changesetNumber: string;
}

// 화면 선택만 하고 그리지 않는다 — 어느 화면을 띄울지는 레지스트리가 정한다.
function ChangesetDetailRouter() {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  return renderChangesetDetailScreen(
    changesetDetail.type,
    changesetDetail.status,
  );
}

interface ChangesetDetailErrorFallbackProps extends ErrorFallbackProps {
  spaceId: string;
  changesetNumber: number;
}

// digestReview.get 같은 하위 쿼리가 NOT_FOUND를 던진 경우, changeset 자체가 사라진
// 게 아니라 다른 탭·리뷰어·MCP가 방금 확정·버려서 status만 바뀐 것일 수 있다.
// changeset.getByNumber를 한 번 재검증해 여전히 존재하면 Router가 자연히 Closed로
// 넘어가고, 재검증 후에도(hasRetried) NOT_FOUND면 그때만 진짜 없는 것으로 본다.
function ChangesetDetailErrorFallback({
  error,
  reset,
  hasRetried,
  eventId,
  componentStack,
  route,
  timestamp,
  spaceId,
  changesetNumber,
}: ChangesetDetailErrorFallbackProps) {
  const utils = trpc.useUtils();
  const notFound = isChangesetNotFound(error);

  useEffect(
    function retryOnceBeforeNotFound() {
      if (notFound && !hasRetried) {
        void utils.changeset.getByNumber
          .invalidate({ spaceId, number: changesetNumber })
          .then(reset);
      }
    },
    [notFound, hasRetried, spaceId, changesetNumber, reset, utils],
  );

  if (notFound && !hasRetried) {
    return <ChangesetDetailLayoutSkeleton />;
  }
  if (notFound) {
    return <ChangesetNotFound />;
  }
  return (
    <SectionErrorFallback
      error={error}
      reset={reset}
      hasRetried={hasRetried}
      eventId={eventId}
      componentStack={componentStack}
      route={route}
      timestamp={timestamp}
    />
  );
}

function ChangesetDetailSpaceGate({
  changesetNumber: rawChangesetNumber,
}: ChangesetDetailRouteProps) {
  const spacePublicId = useSpacePublicId();
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );
  const changesetNumber = Number(rawChangesetNumber);
  const changesetNumberIsValid =
    GetChangesetByNumberInputSchema.shape.number.safeParse(
      changesetNumber,
    ).success;

  if (!space || !changesetNumberIsValid) {
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
          changesetNumber={changesetNumber}
        />
      )}
    >
      <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
        <ChangesetDetailRouter />
      </Suspense>
    </ErrorBoundary>
  );
}

// 원문 등 사이드 패널 탭은 changeset 단위로 살고 죽는다 — 라우트 shell이 이미
// changesetNumber로 key를 걸어두므로(router.tsx), 다른 changeset으로 넘어가면
// 이 Provider째로 리마운트되어 열려있던 탭도 자연히 정리된다.
export function ChangesetDetailScreen({
  changesetNumber,
}: ChangesetDetailRouteProps) {
  return (
    <ChangesetSidePanelProvider>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
        <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
          <ChangesetDetailSpaceGate changesetNumber={changesetNumber} />
        </Suspense>
      </div>
    </ChangesetSidePanelProvider>
  );
}
