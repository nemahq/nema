import { Suspense, useId, useState } from "react";

import {
  Alert,
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useSpacePendingDraftCountSuspenseQuery } from "@web/features/workspace/hooks/useSpacePendingDraftCount";
import {
  DELETE_PENDING_DRAFTS_OPTION,
  resolveSpaceDeletePayload,
} from "@web/features/workspace/resolveSpaceDeletePayload";
import { useTranslation } from "@web/lib/tolgee";

// otherSpaces·draftDisposition 파생을 한 곳에 둔다 — Field와 Footer가 각자
// 따로 계산하면(과거엔 그랬음) 둘 중 하나만 고쳤을 때 "화면에 보이는 선택"과
// "실제로 실행되는 선택"이 어긋날 수 있다.
function useDraftDisposition(
  spaceId: string,
  manualDraftDisposition: string | null,
) {
  const [spaceList] = useSpaceListSuspenseQuery();
  // useSpaceList는 created_at 오름차순이라 필터링 후 첫 항목이 곧 가장 오래된 Space.
  const otherSpaces = spaceList.spaces.filter((space) => space.id !== spaceId);
  const draftDisposition = manualDraftDisposition ?? otherSpaces[0]?.id;
  return { otherSpaces, draftDisposition };
}

interface SpaceDeleteMoveDraftsFieldProps {
  spaceId: string;
  manualDraftDisposition: string | null;
  onManualDraftDispositionChange: (draftDisposition: string) => void;
}

// 이름 입력(확인 제스처)보다 먼저 와야 한다 — 실행에 영향을 주는 선택지는 항상
// 마지막 확인 전에 다 보여야 한다. 이 필드와 하단 footer가 같은 비동기 데이터를
// 각자 다시 조회하는데, react-query 캐시를 공유해 실제 요청은 한 번만 나간다 —
// 그 대가로 입력창을 별도 Suspense 경계 밖에 둬서 로딩과 무관하게 항상 즉시 뜨게 한다.
function SpaceDeleteMoveDraftsField({
  spaceId,
  manualDraftDisposition,
  onManualDraftDispositionChange,
}: SpaceDeleteMoveDraftsFieldProps) {
  const { t } = useTranslation();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const { otherSpaces, draftDisposition } = useDraftDisposition(
    spaceId,
    manualDraftDisposition,
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
        value={draftDisposition}
        onValueChange={onManualDraftDispositionChange}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {otherSpaces.map((space) => (
            <SelectItem key={space.id} value={space.id}>
              {t("space.delete_move_drafts_option", { name: space.name })}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem
            value={DELETE_PENDING_DRAFTS_OPTION}
            className="text-status-error focus:bg-status-error-tint focus:text-status-error"
          >
            {t("space.delete_together_option")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface SpaceDeleteConfirmFooterProps {
  spaceId: string;
  spaceName: string;
  confirmText: string;
  manualDraftDisposition: string | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function SpaceDeleteConfirmFooter({
  spaceId,
  spaceName,
  confirmText,
  manualDraftDisposition,
  onOpenChange,
  onDeleted,
}: SpaceDeleteConfirmFooterProps) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteSpace();
  const [draftCount] = useSpacePendingDraftCountSuspenseQuery(spaceId);
  const { draftDisposition } = useDraftDisposition(
    spaceId,
    manualDraftDisposition,
  );

  const canDelete =
    confirmText === spaceName &&
    (draftCount === 0 || Boolean(draftDisposition));

  function handleDelete() {
    if (!canDelete) {
      return;
    }
    deleteMutation.mutate(
      { spaceId, ...resolveSpaceDeletePayload(draftCount, draftDisposition) },
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
  const [manualDraftDisposition, setManualDraftDisposition] = useState<
    string | null
  >(null);

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
          manualDraftDisposition={manualDraftDisposition}
          onManualDraftDispositionChange={setManualDraftDisposition}
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
          manualDraftDisposition={manualDraftDisposition}
          onOpenChange={onOpenChange}
          onDeleted={onDeleted}
        />
      </Suspense>
    </>
  );
}
