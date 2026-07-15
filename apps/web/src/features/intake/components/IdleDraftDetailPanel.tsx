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
import type { DraftCardData } from "@web/features/intake/types";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSourceDialog } from "./DeleteSourceDialog";
import { DraftDetailHeader } from "./DraftDetailHeader";

interface IdleDraftDetailPanelProps {
  draft: DraftCardData;
  onClose: () => void;
  // 리스트의 카드(예: 결과없음 상태 아이콘)가 "원문이 편집됐는지"를 반영해야 할 때 씀.
  onBodyDirtyChange?: (dirty: boolean) => void;
}

// TODO(임시): 원문 편집·"재생성" 버튼은 UI만 — 원본(body) 저장 API가 아직 없어
// 실제 저장·재생성 연동은 안 했다(백엔드 준비 후 연결할 것). 지금 이대로 기존
// 추출 뮤테이션에 연결하면 편집 내용이 조용히 무시되는 실패가 생겨 일부러
// 비워뒀다. 제목은 기존 update_source_title RPC가 있어 실제로 저장된다.
export function IdleDraftDetailPanel({
  draft,
  onClose,
  onBodyDirtyChange,
}: IdleDraftDetailPanelProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(draft.title ?? "");
  const [body, setBody] = useState(draft.body);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const updateTitleMutation = useUpdateSourceTitle();
  const reassignSpaceMutation = useReassignSourceSpace();
  // 결과없음은 원본을 안 바꾸고 재생성해봐야 또 결과없음이 나올 가능성이 높다 —
  // 원문이 실제로 바뀌기 전까진 재생성을 막아 헛수고를 예방한다. failed/cancelled는
  // 내용 문제가 아닐 수 있어(일시적 시스템 오류 등) 이 제약을 안 둔다.
  const regenerateDisabled = draft.status === "empty" && body === draft.body;

  useEffect(
    function reportBodyDirtyChange() {
      onBodyDirtyChange?.(body !== draft.body);
    },
    [body, draft.body, onBodyDirtyChange],
  );

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
    if (trimmed.length === 0 || trimmed === (draft.title ?? "")) {
      return;
    }
    updateTitleMutation.mutate({ sourceId: draft.sourceId, title: trimmed });
  }

  function handleReassignSpace(nextSpaceId: string) {
    if (nextSpaceId === draft.spaceId) {
      return;
    }
    reassignSpaceMutation.mutate({
      sourceId: draft.sourceId,
      spaceId: nextSpaceId,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <DraftDetailHeader
        spaceId={draft.spaceId}
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
        sourceId={draft.sourceId}
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
          onChange={(e) => setBody(e.target.value)}
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
