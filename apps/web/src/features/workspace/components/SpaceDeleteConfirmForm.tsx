import { useId, useState } from "react";

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
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useDeleteSpace } from "@web/features/workspace/hooks/useDeleteSpace";
import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useSpacePendingDraftCount } from "@web/features/workspace/hooks/useSpacePendingDraftCount";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

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
  const deleteMutation = useDeleteSpace();
  const draftCountQuery = useSpacePendingDraftCount(spaceId);
  const spaceListQuery = useSpaceList();
  const draftCount = draftCountQuery.data ?? 0;
  // useSpaceList는 created_at 오름차순이라 필터링 후 첫 항목이 곧 가장 오래된 Space.
  const otherSpaces = (spaceListQuery.data?.spaces ?? []).filter(
    (space) => space.id !== spaceId,
  );
  const [manualTargetSpaceId, setManualTargetSpaceId] = useState<string | null>(
    null,
  );
  const targetSpaceId = manualTargetSpaceId ?? otherSpaces[0]?.id;

  // 둘 다 성공적으로 로딩을 마치기 전엔 draftCount·otherSpaces가 아직 실제 값이
  // 아니다(0/빈 배열로 폴백 중) — 그 상태로 삭제를 허용하면 대상 선택 UI가 안 뜬
  // 채 서버가 뒤늦게 "이동 대상 필요"를 거부하는 상황이 생긴다.
  const loadError = draftCountQuery.isError || spaceListQuery.isError;
  const dataReady = draftCountQuery.isSuccess && spaceListQuery.isSuccess;
  const canDelete =
    confirmText === spaceName &&
    dataReady &&
    (draftCount === 0 || Boolean(targetSpaceId));

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

      {loadError && (
        <Alert variant="error">
          {getErrorMessage(draftCountQuery.error ?? spaceListQuery.error)}
        </Alert>
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
