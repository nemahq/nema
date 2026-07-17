import { Suspense, useId, useState } from "react";

import {
  Alert,
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useSpacePendingDraftCountSuspenseQuery } from "@web/features/workspace/hooks/useSpacePendingDraftCount";
import { useTranslation } from "@web/lib/tolgee";

function useOtherSpaces(spaceId: string) {
  const [spaceList] = useSpaceListSuspenseQuery();
  // useSpaceList는 created_at 오름차순이라 필터링 후 첫 항목이 곧 가장 오래된 Space.
  return spaceList.spaces.filter((space) => space.id !== spaceId);
}

interface SpaceDeleteMoveDraftsFieldProps {
  spaceId: string;
  manualTargetSpaceId: string | null;
  onManualTargetSpaceIdChange: (spaceId: string) => void;
}

// 이름 입력(확인 제스처)보다 먼저 와야 한다 — 실행에 영향을 주는 선택지는 항상
// 마지막 확인 전에 다 보여야 한다. 이 필드와 하단 footer가 같은 비동기 데이터를
// 각자 다시 조회하는데, react-query 캐시를 공유해 실제 요청은 한 번만 나간다 —
// 그 대가로 입력창을 별도 Suspense 경계 밖에 둬서 로딩과 무관하게 항상 즉시 뜨게 한다.
function SpaceDeleteMoveDraftsField({
  spaceId,
  manualTargetSpaceId,
  onManualTargetSpaceIdChange,
}: SpaceDeleteMoveDraftsFieldProps) {
  const { t } = useTranslation();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const otherSpaces = useOtherSpaces(spaceId);

  if (draftCount === 0) {
    return null;
  }

  const targetSpaceId = manualTargetSpaceId ?? otherSpaces[0]?.id;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-fg-tertiary">
        {t("space.delete_move_drafts_label", { count: draftCount })}
      </label>
      {otherSpaces.length > 1 ? (
        <Select
          value={targetSpaceId}
          onValueChange={onManualTargetSpaceIdChange}
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
  );
}

interface SpaceDeleteConfirmFooterProps {
  spaceId: string;
  spaceName: string;
  confirmText: string;
  manualTargetSpaceId: string | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function SpaceDeleteConfirmFooter({
  spaceId,
  spaceName,
  confirmText,
  manualTargetSpaceId,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFooterProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSpace();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const otherSpaces = useOtherSpaces(spaceId);
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
          ? t("space.delete_deleting")
          : t("space.delete_confirm_button")}
      </Button>
    </DialogFooter>
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
  const [manualTargetSpaceId, setManualTargetSpaceId] = useState<string | null>(
    null,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_confirm_title")}</DialogTitle>
      </DialogHeader>

      <Alert variant="error" icon={false}>
        {t("space.delete_warning")}
      </Alert>

      <Suspense
        fallback={
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-9 w-full" />
          </div>
        }
      >
        <SpaceDeleteMoveDraftsField
          spaceId={spaceId}
          manualTargetSpaceId={manualTargetSpaceId}
          onManualTargetSpaceIdChange={setManualTargetSpaceId}
        />
      </Suspense>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={confirmInputId}
          className="text-sm font-medium text-fg-primary"
        >
          {t("common.delete_confirm_instruction", { value: spaceName })}
        </label>
        <Input
          id={confirmInputId}
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={spaceName}
        />
      </div>

      <Suspense
        fallback={
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" disabled>
              {t("space.delete_confirm_button")}
            </Button>
          </DialogFooter>
        }
      >
        <SpaceDeleteConfirmFooter
          spaceId={spaceId}
          spaceName={spaceName}
          confirmText={confirmText}
          manualTargetSpaceId={manualTargetSpaceId}
          onOpenChange={onOpenChange}
          onDeleted={onDeleted}
        />
      </Suspense>
    </>
  );
}
