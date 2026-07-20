import { useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useCurrentSpaceId, useSpacePublicId } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";

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
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이 이미 마쳤다.
export function ChangesetRecordScreen() {
  return <ChangesetRecordContent />;
}
