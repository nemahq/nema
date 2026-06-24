import { useState } from "react";

import { Button, cn } from "@nema-io/weave";

import { useAssistDraft } from "@web/features/dev-harness/hooks/useAssistDraft";
import { useCreateDraft } from "@web/features/dev-harness/hooks/useCreateDraft";
import { parseTopics } from "@web/features/dev-harness/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";

type Mode = "assist" | "manual";

const MODES = [
  { id: "assist", label: "말뭉치 던지기" },
  { id: "manual", label: "직접 작성" },
] as const;

const TEXTAREA_CLASS =
  "w-full resize-y rounded-lg border border-border bg-surface-raised p-3 text-sm text-fg-primary outline-none focus:border-border-strong";
const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-strong";

// 입구는 두 경로 모두 초안으로 떨어진다 — assist(제목·주제 제안) / 직접 작성. 둘 다 확정 게이트를 거친다.
export function DraftComposer() {
  const [mode, setMode] = useState<Mode>("assist");
  const [rawBody, setRawBody] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topicsText, setTopicsText] = useState("");

  const assistDraft = useAssistDraft();
  const createDraft = useCreateDraft();
  const pending = assistDraft.isPending || createDraft.isPending;
  const error = assistDraft.error ?? createDraft.error;

  function handleAssist() {
    const trimmed = rawBody.trim();
    if (!trimmed || pending) {
      return;
    }
    assistDraft.mutate({ body: trimmed }, { onSuccess: () => setRawBody("") });
  }

  function handleCreate() {
    const trimmedBody = body.trim();
    if (!trimmedBody || pending) {
      return;
    }
    const trimmedTitle = title.trim();
    createDraft.mutate(
      {
        origin: "in_app",
        title: trimmedTitle === "" ? undefined : trimmedTitle,
        body: trimmedBody,
        proposedTopics: parseTopics(topicsText),
      },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setTopicsText("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setMode(entry.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs",
              mode === entry.id
                ? "bg-surface-raised font-semibold text-fg-primary"
                : "text-fg-tertiary hover:text-fg-secondary",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {mode === "assist" ? (
        <>
          <textarea
            value={rawBody}
            onChange={(e) => setRawBody(e.target.value)}
            placeholder="러프하게 던지기 — 제목·주제·정제본문을 제안받아 초안으로 떨어진다"
            rows={5}
            className={TEXTAREA_CLASS}
          />
          <Button
            size="xs"
            className="self-end"
            onClick={handleAssist}
            disabled={!rawBody.trim() || pending}
          >
            제안 받기
          </Button>
        </>
      ) : (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className={INPUT_CLASS}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문"
            rows={4}
            className={TEXTAREA_CLASS}
          />
          <input
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            placeholder="주제 (쉼표로 구분, 선택)"
            className={INPUT_CLASS}
          />
          <Button
            size="xs"
            className="self-end"
            onClick={handleCreate}
            disabled={!body.trim() || pending}
          >
            초안 만들기
          </Button>
        </>
      )}

      {error && (
        <p className="text-xs text-status-error">{getErrorMessage(error)}</p>
      )}
    </div>
  );
}
