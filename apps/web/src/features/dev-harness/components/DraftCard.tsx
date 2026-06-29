import { useState } from "react";

import { Button } from "@nema-io/weave";

import { ConfirmButton } from "@web/features/dev-harness/components/ConfirmButton";
import { useConfirmDraft } from "@web/features/dev-harness/hooks/useConfirmDraft";
import { useDeleteDraft } from "@web/features/dev-harness/hooks/useDeleteDraft";
import { useEditDraft } from "@web/features/dev-harness/hooks/useEditDraft";
import type {
  DraftSummary,
  TopicSummary,
} from "@web/features/dev-harness/types";
import { formatDateTime, parseTopics } from "@web/features/dev-harness/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface-card px-2 py-1 text-sm text-fg-primary outline-none focus:border-border-strong";

interface DraftCardProps {
  draft: DraftSummary;
  topicOptions: TopicSummary[];
}

// 인박스 한 칸 — 제안된 제목·본문·주제를 인라인으로 손보고, 확정하면 추출이 깨어난다.
export function DraftCard({ draft, topicOptions }: DraftCardProps) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [body, setBody] = useState(draft.body);
  const [topicsText, setTopicsText] = useState(draft.proposedTopics.join(", "));

  const editDraft = useEditDraft();
  const confirmDraft = useConfirmDraft();
  const deleteDraft = useDeleteDraft();
  const pending =
    editDraft.isPending || confirmDraft.isPending || deleteDraft.isPending;
  const error = editDraft.error ?? confirmDraft.error ?? deleteDraft.error;

  const topics = parseTopics(topicsText);
  const datalistId = `topics-${draft.id}`;

  // 한 카드에 저장·확정·버리기 mutation이 얽혀 있어, 새 액션 진입 시 형제 mutation의
  // 옛 에러를 지운다 — 안 그러면 성공한 액션 뒤에도 직전 실패 에러가 그대로 남는다.
  function resetErrors() {
    editDraft.reset();
    confirmDraft.reset();
    deleteDraft.reset();
  }

  function handleSave() {
    const trimmedBody = body.trim();
    if (!trimmedBody || pending) {
      return;
    }
    resetErrors();
    const trimmedTitle = title.trim();
    editDraft.mutate({
      draftId: draft.id,
      title: trimmedTitle === "" ? undefined : trimmedTitle,
      body: trimmedBody,
      proposedTopics: topics,
    });
  }

  async function handleConfirm() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || pending) {
      return;
    }
    resetErrors();
    // 확정은 저장된 본문을 박제한다 — 바뀐 본문을 먼저 반영한 뒤 확정한다.
    const trimmedBody = body.trim();
    try {
      if (trimmedBody && trimmedBody !== draft.body) {
        await editDraft.mutateAsync({
          draftId: draft.id,
          title: trimmedTitle,
          body: trimmedBody,
          proposedTopics: topics,
        });
      }
      confirmDraft.mutate({ draftId: draft.id, title: trimmedTitle, topics });
    } catch {
      // 본문 저장이 실패하면 확정하지 않는다 — 에러는 editDraft.error로 노출된다.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-3">
      <span className="text-xs text-fg-tertiary">
        {draft.origin} · {formatDateTime(draft.createdAt)}
      </span>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 (확정에 필요)"
        className={INPUT_CLASS}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className={`${INPUT_CLASS} resize-y`}
      />
      <input
        value={topicsText}
        onChange={(e) => setTopicsText(e.target.value)}
        placeholder="주제 (쉼표로 구분)"
        list={datalistId}
        className={INPUT_CLASS}
      />
      <datalist id={datalistId}>
        {topicOptions.map((topic) => (
          <option key={topic.id} value={topic.name} />
        ))}
      </datalist>

      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          onClick={handleSave}
          disabled={!body.trim() || pending}
        >
          저장
        </Button>
        <Button
          size="xs"
          onClick={handleConfirm}
          disabled={!title.trim() || pending}
        >
          확정
        </Button>
        <span className="flex-1" />
        <ConfirmButton
          label="버리기"
          disabled={pending}
          onConfirm={() => {
            resetErrors();
            deleteDraft.mutate({ draftId: draft.id });
          }}
        />
      </div>

      {error && (
        <p className="text-xs text-status-error">{getErrorMessage(error)}</p>
      )}
    </div>
  );
}
