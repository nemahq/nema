import { useEffect, useRef, useState } from "react";

import {
  SOURCE_BODY_MAX_LENGTH,
  SOURCE_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import {
  Alert,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { useReassignSourceSpace } from "@web/features/intake/hooks/useReassignSourceSpace";
import { useStartSourceDigestion } from "@web/features/intake/hooks/useStartSourceDigestion";
import { useUpdateSourceBody } from "@web/features/intake/hooks/useUpdateSourceBody";
import { useUpdateSourceTitle } from "@web/features/intake/hooks/useUpdateSourceTitle";
import type { DraftDetailPanelProps } from "@web/features/intake/types";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";
import { DraftBodyView } from "./DraftBodyView";
import { DraftDetailHeader } from "./DraftDetailHeader";

export function IdleDraftDetailPanel({
  sourceId,
  spaceId,
  title: initialTitle,
  body: initialBody,
  status,
  onClose,
  onBodyDirtyChange,
}: DraftDetailPanelProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState(initialBody);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const updateTitleMutation = useUpdateSourceTitle();
  const updateBodyMutation = useUpdateSourceBody();
  const startDigestionMutation = useStartSourceDigestion();
  const reassignSpaceMutation = useReassignSourceSpace();
  const bodyDirty = body !== initialBody;
  // 결과없음은 원본을 안 바꾸고 정리해봐야 또 결과없음이 나올 가능성이 높다 —
  // 원문이 실제로 바뀌기 전까진 정리를 막아 헛수고를 예방한다. failed/cancelled는
  // 내용 문제가 아닐 수 있어(일시적 시스템 오류 등) 이 제약을 안 둔다.
  const regenerateDisabled =
    (status === "empty" && !bodyDirty) || isRegenerating;

  function handleBodyChange(nextBody: string) {
    setBody(nextBody);
  }

  // onChange 시점에만 알리면, 저장 후 폴링으로 initialBody가 따라잡아도(예:
  // Organize가 body를 저장한 뒤) 재계산할 트리거가 없어 dirty가 그대로
  // 굳어버린다 — bodyDirty 자체를 구독해 매번 최신값으로 동기화한다.
  useEffect(
    function syncBodyDirty() {
      onBodyDirtyChange?.(bodyDirty);
    },
    [bodyDirty, onBodyDirtyChange],
  );

  // blur 시점에 저장해 편집 중 이탈(다른 초안 클릭 등)로 잃는 걸 막는다 — 다만
  // Organize는 이 시점에 기대지 않고 클릭 시점에 한 번 더 직접 저장한다(아래).
  function handleBodyBlur() {
    if (!bodyDirty || body.trim().length === 0) {
      return;
    }
    updateBodyMutation.mutate({ sourceId, body });
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      if (bodyDirty && body.trim().length > 0) {
        await updateBodyMutation.mutateAsync({ sourceId, body });
      }
      await startDigestionMutation.mutateAsync({ sourceId });
    } catch {
      // 실패는 각 뮤테이션의 isError로 인라인 표시된다 — 추가 처리 없음.
    } finally {
      setIsRegenerating(false);
    }
  }

  useRegisterAction("draft.regenerate", {
    execute: handleRegenerate,
    enabled: !regenerateDisabled,
  });

  useEffect(function focusTitleAtEnd() {
    const el = titleInputRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // 최초 마운트 시 한 번만 — draft가 바뀌면 패널 자체가 다시 마운트된다.
  }, []);

  // SourceUpdateTitleInputSchema가 title min(1)을 강제해 빈 제목 저장 자체가 안
  // 된다 — 지우고 나가면 그냥 저장을 시도하지 않고 이전 제목으로 남는다.
  function handleTitleBlur() {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === (initialTitle ?? "")) {
      return;
    }
    updateTitleMutation.mutate({ sourceId, title: trimmed });
  }

  function handleReassignSpace(nextSpaceId: string) {
    if (nextSpaceId === spaceId) {
      return;
    }
    reassignSpaceMutation.mutate({
      sourceId,
      spaceId: nextSpaceId,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <DraftDetailHeader
        spaceId={spaceId}
        onClose={onClose}
        onReassignSpace={handleReassignSpace}
        reassignPending={reassignSpaceMutation.isPending}
        extraAction={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("common.delete")}
                onClick={() => setDeleteDialogOpen(true)}
                className="size-7 text-fg-tertiary"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("common.delete")}</TooltipContent>
          </Tooltip>
        }
      />
      <DeleteSourceDialog
        sourceId={sourceId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={onClose}
      />
      <input
        ref={titleInputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={t("intake.draft_untitled")}
        maxLength={SOURCE_TITLE_MAX_LENGTH}
        aria-invalid={updateTitleMutation.isError}
        className="bg-transparent px-6 pt-4 text-xl font-bold text-fg-primary outline-none placeholder:text-fg-tertiary"
      />
      {updateTitleMutation.isError && (
        <div className="px-6 pt-2">
          <Alert variant="error">
            {getErrorMessage(updateTitleMutation.error)}
          </Alert>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-6 py-4">
        <DraftBodyView
          value={body}
          onChange={handleBodyChange}
          onBlur={handleBodyBlur}
          maxLength={SOURCE_BODY_MAX_LENGTH}
          ariaInvalid={updateBodyMutation.isError}
        />
        {updateBodyMutation.isError && (
          <Alert variant="error">
            {getErrorMessage(updateBodyMutation.error)}
          </Alert>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-6 py-4">
        {startDigestionMutation.isError && (
          <Alert variant="error">
            {getErrorMessage(startDigestionMutation.error)}
          </Alert>
        )}
        <div className="flex justify-start">
          <Button
            size="sm"
            disabled={regenerateDisabled}
            onClick={handleRegenerate}
          >
            {isRegenerating
              ? t("intake.draft_organizing")
              : t("intake.draft_organize")}
          </Button>
        </div>
      </div>
    </div>
  );
}
