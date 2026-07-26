import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { changesetDisplayState } from "@web/features/review/constants";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useSpacePublicId } from "@web/hooks/useSpacePublicId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";

function ChangesetRecordContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spacePublicId = useSpacePublicId();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
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

  const title = changesetDisplayTitle(changesetDetail, t);

  return (
    <ChangesetDetailLayout title={title}>
      <ChangesetDetailHeader
        title={title}
        changesetNumber={changesetDetail.number}
        state={changesetDisplayState(
          changesetDetail.status,
          changesetDetail.outcome,
        )}
        time={changesetDetail.updatedAt}
        actions={
          changesetDetail.outcome === "applied" && (
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
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 changeset 상세만의 콘텐츠 쿼리(useChangesetDetailSuspenseQuery)
// 에 대한 Suspense만 책임진다.
export function ChangesetRecordScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <ChangesetRecordContent />
    </Suspense>
  );
}
