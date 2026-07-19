import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";

import { GetChangesetByNumberInputSchema } from "@nema-io/shared";
import { Button } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { NavigationBar } from "@web/components/layout/NavigationBar";
import { isChangesetNotFound } from "@web/features/review/changesetErrors";
import { ReviewHeader } from "@web/features/review/components/ReviewHeader";
import { ReviewNavigationBar } from "@web/features/review/components/ReviewNavigationBar";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useSpaceListSuspenseQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface ClosedReviewScreenProps {
  spacePublicId: string;
  changesetNumber: string;
}

function ClosedReviewNavSkeleton() {
  return <NavigationBar />;
}

function ClosedReviewNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <h1 className="text-lg font-semibold text-fg-primary">
        {t("review.detail_not_found_title")}
      </h1>
      <p className="text-sm text-fg-tertiary">
        {t("review.detail_not_found_description")}
      </p>
    </div>
  );
}

interface ClosedReviewBodyProps {
  spacePublicId: string;
  spaceId: string;
  number: number;
}

// space·number가 해석된 뒤에만 마운트된다(ClosedReviewSpaceGate 참고) — getByNumber
// suspense query가 둘 다 필수 인자로 받아야 해서, 이 단계가 분리돼 있다.
function ClosedReviewBody({
  spacePublicId,
  spaceId,
  number,
}: ClosedReviewBodyProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(spaceId, number);
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
            number={changesetDetail.number}
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

function ClosedReviewSpaceGate({
  spacePublicId,
  changesetNumber,
}: ClosedReviewScreenProps) {
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );
  const number = Number(changesetNumber);
  const numberIsValid =
    GetChangesetByNumberInputSchema.shape.number.safeParse(number).success;

  if (!space || !numberIsValid) {
    return <ClosedReviewNotFound />;
  }

  return (
    <ErrorBoundary
      boundaryName="closed-review-detail"
      fallbackRender={(props) =>
        isChangesetNotFound(props.error) ? (
          <ClosedReviewNotFound />
        ) : (
          <SectionErrorFallback {...props} />
        )
      }
    >
      <Suspense fallback={<ClosedReviewNavSkeleton />}>
        <ClosedReviewBody
          spacePublicId={spacePublicId}
          spaceId={space.id}
          number={number}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

export function ClosedReviewScreen({
  spacePublicId,
  changesetNumber,
}: ClosedReviewScreenProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<ClosedReviewNavSkeleton />}>
        <ClosedReviewSpaceGate
          spacePublicId={spacePublicId}
          changesetNumber={changesetNumber}
        />
      </Suspense>
    </main>
  );
}
