import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { RelativeTime } from "@web/components/ui/RelativeTime";
import { CHANGESET_TYPE_LABEL } from "@web/features/review/constants";
import { useChangesetListQuery } from "@web/features/review/hooks/useChangesetListQuery";
import { useRestoreReview } from "@web/features/review/hooks/useRestoreReview";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { useTrashReviewSource } from "@web/features/review/hooks/useTrashReviewSource";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useSpaceList } from "@web/features/workspace";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { ChangesetStatusBadge } from "./ChangesetStatusBadge";

interface ChangesetDetailScreenProps {
  spacePublicId: string;
  changesetId: string;
}

export function ChangesetDetailScreen({
  spacePublicId,
  changesetId,
}: ChangesetDetailScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spaceListQuery = useSpaceList();
  const space = spaceListQuery.data?.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );
  // listChangesets가 spaceId로 스코프하므로, entry를 못 찾는 것 자체가 "이 Space
  // 소속이 아님"까지 겸해 막아준다 — 다른 Space의 changesetId를 URL에 넣어도 조용히
  // 안 뜨고 detail_not_found로 떨어진다.
  const changesetListQuery = useChangesetListQuery(space?.id);
  const restoreReview = useRestoreReview();
  const revertChangeset = useRevertChangeset();
  const trashSource = useTrashReviewSource();

  const [trashDialogOpen, setTrashDialogOpen] = useState(false);

  if (changesetListQuery.isError) {
    return (
      <main className="flex flex-1 items-center justify-center bg-surface-card">
        <p className="text-sm text-status-error">
          {getErrorMessage(changesetListQuery.error)}
        </p>
      </main>
    );
  }
  if (!spaceListQuery.data || !changesetListQuery.data) {
    return (
      <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    );
  }

  const entry = changesetListQuery.data.changesets.find(
    (c) => c.id === changesetId,
  );
  if (!space || !entry) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-1 bg-surface-card px-6 text-center">
        <h1 className="text-lg font-semibold text-fg-primary">
          {t("review.detail_not_found_title")}
        </h1>
        <p className="text-sm text-fg-tertiary">
          {t("review.detail_not_found_description")}
        </p>
      </main>
    );
  }

  const isIngestion = entry.type === "ingestion";
  const discarded = entry.status === "rejected";
  const applied = entry.status === "applied";
  // restore_ingestion_review는 원본이 pending일 때만 허용한다 — listChangesets가
  // 내려주는 sourceStatus로 클릭 전에 미리 비활성화한다(원본 완전 삭제 직후의
  // invalidate 반영 지연은 trashSource.isSuccess로 즉시 커버). "trashed"만이 아니라
  // "active"(그 사이 다른 리뷰가 이 원본을 재인제스천해 확정한 경우)도 막는 이유가
  // 서로 달라 사유 문구를 따로 고른다 — active인데 "삭제되어"라고 하면 틀린 안내다.
  const sourceStatus = entry.sourceStatus;
  let blockReason: "trashed" | "reprocessed" | null = null;
  if (trashSource.isSuccess || sourceStatus === "trashed") {
    blockReason = "trashed";
  } else if (sourceStatus === "active") {
    blockReason = "reprocessed";
  }
  const restoreBlocked = blockReason !== null;
  const error =
    restoreReview.error ?? revertChangeset.error ?? trashSource.error;

  function detailBodyTranslationKey(): TranslationKey {
    if (!isIngestion) {
      return "review.detail_generic_body";
    }
    return discarded
      ? "review.detail_ingestion_discarded_body"
      : "review.detail_ingestion_applied_body";
  }
  const detailBodyKey = detailBodyTranslationKey();

  function handleRestore() {
    restoreReview.mutate(
      { changesetId },
      {
        onSuccess: () =>
          navigate({
            to: "/space/$spacePublicId/review/$changesetId",
            params: { spacePublicId, changesetId },
          }),
      },
    );
  }

  function handleRevert() {
    revertChangeset.mutate({ changesetId });
  }

  function handleTrashSource() {
    if (!entry?.sourceId) {
      return;
    }
    trashSource.mutate(
      { sourceId: entry.sourceId },
      { onSuccess: () => setTrashDialogOpen(false) },
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
        <header className="flex flex-col gap-3 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            {entry.type !== "manual" && (
              <span className="rounded-[4px] bg-surface-raised px-2 py-0.5 text-[12px] font-medium text-fg-secondary">
                {CHANGESET_TYPE_LABEL[entry.type]}
              </span>
            )}
            <ChangesetStatusBadge status={entry.status} type={entry.type} />
            <RelativeTime dateTime={entry.createdAt} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-lg font-semibold text-fg-primary">
              <span className="text-fg-tertiary">#{entry.number} · </span>
              {changesetDisplayTitle(entry, t)}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {applied && !entry.reverted && (
                <Button
                  variant="neutral"
                  onClick={handleRevert}
                  disabled={revertChangeset.isPending}
                >
                  {revertChangeset.isPendingAfterDelay
                    ? t("common.saving")
                    : t("review.detail_revert_action")}
                </Button>
              )}
              {discarded && isIngestion && (
                <>
                  <Button
                    variant="neutral"
                    onClick={handleRestore}
                    disabled={restoreReview.isPending || restoreBlocked}
                  >
                    {restoreReview.isPendingAfterDelay
                      ? t("common.saving")
                      : t("review.detail_restore_action")}
                  </Button>
                  <Button
                    variant="neutral"
                    onClick={() => setTrashDialogOpen(true)}
                    disabled={restoreBlocked}
                  >
                    {t("review.detail_trash_source_action")}
                  </Button>
                </>
              )}
            </div>
          </div>
          {discarded && isIngestion && blockReason && (
            <p className="text-xs text-fg-tertiary">
              {t(
                blockReason === "trashed"
                  ? "review.detail_trash_source_disabled_reason"
                  : "review.detail_source_reprocessed_disabled_reason",
              )}
            </p>
          )}
          {error && (
            <p className="text-sm text-status-error">
              {getErrorMessage(error)}
            </p>
          )}
        </header>

        <p className="text-sm text-fg-secondary">{t(detailBodyKey)}</p>
      </div>

      <Dialog open={trashDialogOpen} onOpenChange={setTrashDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {t("review.detail_trash_source_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {t("review.detail_trash_source_dialog_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTrashDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={handleTrashSource}
              disabled={trashSource.isPending}
            >
              {trashSource.isPendingAfterDelay
                ? t("common.deleting")
                : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
