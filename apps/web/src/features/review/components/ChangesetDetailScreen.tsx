import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { CHANGESET_TYPE_LABEL } from "@web/features/review/constants";
import { useChangesetListQuery } from "@web/features/review/hooks/useChangesetListQuery";
import { useRestoreReview } from "@web/features/review/hooks/useRestoreReview";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { useTrashReviewSource } from "@web/features/review/hooks/useTrashReviewSource";
import { summarizeChangesetEffect } from "@web/features/review/utils";
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
  const changesetListQuery = useChangesetListQuery();
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
  if (!changesetListQuery.data) {
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
  if (!entry) {
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
  // invalidate 반영 지연은 trashSource.isSuccess로 즉시 커버).
  const sourceTrashed =
    trashSource.isSuccess || entry.sourceStatus !== "pending";
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
            <ChangesetStatusBadge status={entry.status} />
            <RelativeTime dateTime={entry.createdAt} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-lg font-semibold text-fg-primary">
              {entry.number !== null && (
                <span className="text-fg-tertiary">#{entry.number} · </span>
              )}
              {summarizeChangesetEffect(entry.effect, t)}
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
                    disabled={restoreReview.isPending || sourceTrashed}
                  >
                    {restoreReview.isPendingAfterDelay
                      ? t("common.saving")
                      : t("review.detail_restore_action")}
                  </Button>
                  <Button
                    variant="neutral"
                    onClick={() => setTrashDialogOpen(true)}
                    disabled={sourceTrashed}
                  >
                    {t("review.detail_trash_source_action")}
                  </Button>
                </>
              )}
            </div>
          </div>
          {discarded && isIngestion && sourceTrashed && (
            <p className="text-xs text-fg-tertiary">
              {t("review.detail_trash_source_disabled_reason")}
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
