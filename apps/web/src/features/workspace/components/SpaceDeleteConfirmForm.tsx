import { Suspense, useId, useState } from "react";

import {
  Alert,
  Button,
  Checkbox,
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
  Skeleton,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useSpacePendingDraftCountSuspenseQuery } from "@web/features/workspace/hooks/useSpacePendingDraftCount";
import { resolveSpaceDeletePayload } from "@web/features/workspace/resolveSpaceDeletePayload";
import { useTranslation } from "@web/lib/tolgee";

// otherSpaces·targetSpaceId 파생을 한 곳에 둔다 — Field와 Footer가 각자
// 따로 계산하면(과거엔 그랬음) 둘 중 하나만 고쳤을 때 "화면에 보이는 선택"과
// "실제로 실행되는 선택"이 어긋날 수 있다.
function useDeleteMoveTarget(
  spaceId: string,
  manualTargetSpaceId: string | null,
) {
  const [spaceList] = useSpaceListSuspenseQuery();
  // useSpaceList는 created_at 오름차순이라 필터링 후 첫 항목이 곧 가장 오래된 Space.
  const otherSpaces = spaceList.spaces.filter((space) => space.id !== spaceId);
  const targetSpaceId = manualTargetSpaceId ?? otherSpaces[0]?.id;
  return { otherSpaces, targetSpaceId };
}

interface SpaceDeleteMoveDraftsFieldProps {
  spaceId: string;
  manualTargetSpaceId: string | null;
  onManualTargetSpaceIdChange: (targetSpaceId: string) => void;
  deleteTogether: boolean;
  onDeleteTogetherChange: (deleteTogether: boolean) => void;
}

// 이름 입력(확인 제스처)보다 먼저 와야 한다 — 실행에 영향을 주는 선택지는 항상
// 마지막 확인 전에 다 보여야 한다. 이 필드와 하단 footer가 같은 비동기 데이터를
// 각자 다시 조회하는데, react-query 캐시를 공유해 실제 요청은 한 번만 나간다 —
// 그 대가로 입력창을 별도 Suspense 경계 밖에 둬서 로딩과 무관하게 항상 즉시 뜨게 한다.
function SpaceDeleteMoveDraftsField({
  spaceId,
  manualTargetSpaceId,
  onManualTargetSpaceIdChange,
  deleteTogether,
  onDeleteTogetherChange,
}: SpaceDeleteMoveDraftsFieldProps) {
  const { t } = useTranslation();
  const checkboxId = useId();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const { otherSpaces, targetSpaceId } = useDeleteMoveTarget(
    spaceId,
    manualTargetSpaceId,
  );

  if (draftCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-fg-tertiary">
        {t("space.delete_pending_drafts_label", { count: draftCount })}
      </label>
      <Select
        value={targetSpaceId}
        onValueChange={onManualTargetSpaceIdChange}
        disabled={deleteTogether}
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
      <label
        htmlFor={checkboxId}
        className="flex items-center gap-2 text-sm text-fg-secondary"
      >
        <Checkbox
          id={checkboxId}
          checked={deleteTogether}
          onCheckedChange={(checked) =>
            onDeleteTogetherChange(checked === true)
          }
        />
        {t("space.delete_together_option")}
      </label>
    </div>
  );
}

interface SpaceDeleteConfirmFooterProps {
  spaceId: string;
  spaceName: string;
  confirmText: string;
  manualTargetSpaceId: string | null;
  deleteTogether: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function SpaceDeleteConfirmFooter({
  spaceId,
  spaceName,
  confirmText,
  manualTargetSpaceId,
  deleteTogether,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFooterProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSpace();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const { targetSpaceId } = useDeleteMoveTarget(spaceId, manualTargetSpaceId);

  const canDelete =
    confirmText === spaceName &&
    (draftCount === 0 || deleteTogether || Boolean(targetSpaceId));

  function handleDelete() {
    if (!canDelete) {
      return;
    }
    deleteMutation.mutate(
      {
        spaceId,
        ...resolveSpaceDeletePayload(draftCount, targetSpaceId, deleteTogether),
      },
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
  const [deleteTogether, setDeleteTogether] = useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_confirm_title")}</DialogTitle>
        <DialogDescription asChild>
          <Alert variant="error" icon={false}>
            {t("space.delete_warning")}
          </Alert>
        </DialogDescription>
      </DialogHeader>

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
          deleteTogether={deleteTogether}
          onDeleteTogetherChange={setDeleteTogether}
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
          deleteTogether={deleteTogether}
          onOpenChange={onOpenChange}
          onDeleted={onDeleted}
        />
      </Suspense>
    </>
  );
}
