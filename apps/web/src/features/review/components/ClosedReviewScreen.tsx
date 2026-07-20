import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { ReviewHeader } from "@web/features/review/components/ReviewHeader";
import { ReviewNavigationBar } from "@web/features/review/components/ReviewNavigationBar";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useTranslation } from "@web/lib/tolgee";

interface ClosedReviewScreenProps {
  spacePublicId: string;
  spaceId: string;
  changesetNumber: number;
}

function ClosedReviewNavSkeleton() {
  return <NavigationBar />;
}

function ClosedReviewContent({
  spacePublicId,
  spaceId,
  changesetNumber,
}: ClosedReviewScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  const revertChangeset = useRevertChangeset();

  function handleRevert() {
    revertChangeset.mutate(
      { changesetId: changesetDetail.id },
      {
        onSuccess: ({ revertChangesetNumber }) => {
          navigate({
            to: "/space/$spacePublicId/changesets/$changesetNumber",
            params: {
              spacePublicId,
              changesetNumber: String(revertChangesetNumber),
            },
          });
        },
      },
    );
  }

  return (
    <>
      <ReviewNavigationBar
        spacePublicId={spacePublicId}
        title={changesetDisplayTitle(changesetDetail, t)}
      />

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          <ReviewHeader
            title={changesetDisplayTitle(changesetDetail, t)}
            changesetNumber={changesetDetail.number}
            status={changesetDetail.status}
            time={changesetDetail.updatedAt}
            actions={
              changesetDetail.status === "applied" && (
                <Button
                  variant="neutral"
                  className="shrink-0"
                  onClick={handleRevert}
                  disabled={revertChangeset.isPending}
                >
                  {t("review.detail_revert_action")}
                </Button>
              )
            }
          />
        </div>
      </div>
    </>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 changeset 상세만의 콘텐츠 쿼리(useChangesetDetailSuspenseQuery)
// 에 대한 Suspense만 책임진다.
export function ClosedReviewScreen(props: ClosedReviewScreenProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<ClosedReviewNavSkeleton />}>
        <ClosedReviewContent {...props} />
      </Suspense>
    </main>
  );
}
