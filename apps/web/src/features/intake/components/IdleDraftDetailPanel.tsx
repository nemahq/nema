import { useEffect, useRef, useState } from "react";

import { SOURCE_TITLE_MAX_LENGTH } from "@nema-io/shared";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { useReassignSourceSpace } from "@web/features/intake/hooks/useReassignSourceSpace";
import { useUpdateSourceTitle } from "@web/features/intake/hooks/useUpdateSourceTitle";
import type { DraftDetailPanelProps } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";
import { DraftDetailHeader } from "./DraftDetailHeader";

// TODO: 원본(body) 저장 API(update_source_body)는 이미 있다(#415) — 재생성
// 버튼과의 실제 연동(로딩·실패 처리 설계 포함)은 아직 후속 작업으로 남겨뒀다.
// 제목은 기존 update_source_title RPC로 실제 저장된다.
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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const updateTitleMutation = useUpdateSourceTitle();
  const reassignSpaceMutation = useReassignSourceSpace();
  // 결과없음은 원본을 안 바꾸고 재생성해봐야 또 결과없음이 나올 가능성이 높다 —
  // 원문이 실제로 바뀌기 전까진 재생성을 막아 헛수고를 예방한다. failed/cancelled는
  // 내용 문제가 아닐 수 있어(일시적 시스템 오류 등) 이 제약을 안 둔다.
  const regenerateDisabled = status === "empty" && body === initialBody;

  function handleBodyChange(nextBody: string) {
    setBody(nextBody);
    onBodyDirtyChange?.(nextBody !== initialBody);
  }

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
        className="bg-transparent px-6 pt-4 text-xl font-bold text-fg-primary outline-none placeholder:text-fg-tertiary"
      />
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          className="flex-1 resize-none text-sm leading-relaxed text-fg-primary outline-none"
        />
      </div>
      <div className="flex shrink-0 justify-start px-6 py-4">
        <Button size="sm" disabled={regenerateDisabled}>
          {t("intake.draft_regenerate")}
        </Button>
      </div>
    </div>
  );
}
