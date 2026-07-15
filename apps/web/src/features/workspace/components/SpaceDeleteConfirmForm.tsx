import { Suspense, useId, useState } from "react";

import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useSpacePendingDraftCountSuspenseQuery } from "@web/features/workspace/hooks/useSpacePendingDraftCount";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceDeleteConfirmBodyProps {
  spaceId: string;
  spaceName: string;
  confirmText: string;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function SpaceDeleteConfirmBody({
  spaceId,
  spaceName,
  confirmText,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmBodyProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSpace();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const [spaceList] = useSpaceListSuspenseQuery();

  // useSpaceList는 created_at 오름차순이라 필터링 후 첫 항목이 곧 가장 오래된 Space.
  const otherSpaces = spaceList.spaces.filter((space) => space.id !== spaceId);
  const [manualTargetSpaceId, setManualTargetSpaceId] = useState<string | null>(
    null,
  );
  const targetSpaceId = manualTargetSpaceId ?? otherSpaces[0]?.id;

  const canDelete =
    confirmText === spaceName && (draftCount === 0 || Boolean(targetSpaceId));

  function handleDelete() {
    if (!canDelete) {
      return;
    }
    deleteMutation.mutate(
      { spaceId, targetSpaceId: draftCount > 0 ? targetSpaceId : undefined },
      {
        onSuccess: () => {
          onDeleted();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <>
      {draftCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fg-tertiary">
            {t("space.delete_move_drafts_label", { count: draftCount })}
          </label>
          {otherSpaces.length > 1 ? (
            <Select
              value={targetSpaceId}
              onValueChange={setManualTargetSpaceId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherSpaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-fg-primary">{otherSpaces[0]?.name}</p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={!canDelete || deleteMutation.isPending}
        >
          {deleteMutation.isPendingAfterDelay
            ? t("common.deleting")
            : t("common.delete")}
        </Button>
      </DialogFooter>
    </>
  );
}

interface SpaceDeleteConfirmFormProps {
  spaceId: string;
  spaceName: string;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function SpaceDeleteConfirmForm({
  spaceId,
  spaceName,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFormProps) {
  const { t } = useTranslation();
  const confirmInputId = useId();
  const [confirmText, setConfirmText] = useState("");

  const disabledFooter = (
    <DialogFooter>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        {t("common.cancel")}
      </Button>
      <Button variant="danger" disabled>
        {t("common.delete")}
      </Button>
    </DialogFooter>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_title")}</DialogTitle>
        <DialogDescription>{t("space.delete_warning")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={confirmInputId} className="text-xs text-fg-tertiary">
          {t("space.delete_confirm_instruction", { name: spaceName })}
        </label>
        <Input
          id={confirmInputId}
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={spaceName}
        />
      </div>

      <Suspense fallback={disabledFooter}>
        <SpaceDeleteConfirmBody
          spaceId={spaceId}
          spaceName={spaceName}
          confirmText={confirmText}
          onOpenChange={onOpenChange}
          onDeleted={onDeleted}
        />
      </Suspense>
    </>
  );
}
