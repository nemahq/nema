import { Suspense } from "react";

import { GetChangesetByNumberInputSchema } from "@nema-io/shared";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { NavigationBar } from "@web/components/layout/NavigationBar";
import { isChangesetNotFound } from "@web/features/review/changesetErrors";
import { ChangesetNotFound } from "@web/features/review/components/ChangesetNotFound";
import { ClosedReviewScreen } from "@web/features/review/components/ClosedReviewScreen";
import { OpenReviewScreen } from "@web/features/review/components/OpenReviewScreen";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useSpaceListSuspenseQuery } from "@web/features/workspace";

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

  if (changesetDetail.status === "pending") {
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
      fallbackRender={(props) =>
        isChangesetNotFound(props.error) ? (
          <ChangesetNotFound />
        ) : (
          <SectionErrorFallback {...props} />
        )
      }
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
    <Suspense fallback={<ChangesetDetailNavSkeleton />}>
      <ChangesetDetailSpaceGate
        spacePublicId={spacePublicId}
        changesetNumber={changesetNumber}
      />
    </Suspense>
  );
}
