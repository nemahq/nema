import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { ReviewHeader } from "@web/features/review/components/ReviewHeader";
import { ReviewNavigationBar } from "@web/features/review/components/ReviewNavigationBar";
import { useChangesetListSuspenseQuery } from "@web/features/review/hooks/useChangesetListQuery";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useSpaceListSuspenseQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface ClosedReviewScreenProps {
  spacePublicId: string;
  changesetId: string;
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
  changesetId: string;
}

// space가 해석된 뒤에만 마운트된다(ClosedReviewSpaceGate 참고) — changesetList
// suspense query가 spaceId를 필수 인자로 받아야 해서, 이 단계가 분리돼 있다.
function ClosedReviewBody({
  spacePublicId,
  spaceId,
  changesetId,
}: ClosedReviewBodyProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [changesetList] = useChangesetListSuspenseQuery(spaceId);
  const entry = changesetList.changesets.find((c) => c.id === changesetId);
  const revertChangeset = useRevertChangeset();

  if (!entry) {
    return <ClosedReviewNotFound />;
  }

  function handleRevert() {
    revertChangeset.mutate(
      { changesetId },
      {
        onSuccess: ({ revertChangesetId }) => {
          navigate({
            to: "/space/$spacePublicId/changesets/$changesetId",
            params: { spacePublicId, changesetId: revertChangesetId },
          });
        },
      },
    );
  }

  return (
    <>
      <ReviewNavigationBar
        spacePublicId={spacePublicId}
        title={changesetDisplayTitle(entry, t)}
      />

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          <ReviewHeader
            title={changesetDisplayTitle(entry, t)}
            number={entry.number}
            status={entry.status}
            time={entry.updatedAt}
            actions={
              entry.status === "applied" && (
                <Button
                  variant="neutral"
                  size="sm"
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
  changesetId,
}: ClosedReviewScreenProps) {
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  if (!space) {
    return <ClosedReviewNotFound />;
  }

  return (
    <Suspense fallback={<ClosedReviewNavSkeleton />}>
      <ClosedReviewBody
        spacePublicId={spacePublicId}
        spaceId={space.id}
        changesetId={changesetId}
      />
    </Suspense>
  );
}

export function ClosedReviewScreen({
  spacePublicId,
  changesetId,
}: ClosedReviewScreenProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<ClosedReviewNavSkeleton />}>
        <ClosedReviewSpaceGate
          spacePublicId={spacePublicId}
          changesetId={changesetId}
        />
      </Suspense>
    </main>
  );
}
