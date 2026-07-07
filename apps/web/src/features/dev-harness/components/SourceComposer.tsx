import { useState } from "react";

import { Button } from "@nema-io/weave";

import { useCreateSource } from "@web/features/dev-harness/hooks/useCreateSource";
import { getErrorMessage } from "@web/lib/getErrorMessage";

const TEXTAREA_CLASS =
  "w-full resize-y rounded-lg border border-border bg-surface-raised p-3 text-sm text-fg-primary outline-none focus:border-border-strong";

// 원문을 그대로 박제한다 — 다듬기는 없다. 워커가 Digest 후보를 만들면 아래 대기 목록에 뜬다.
export function SourceComposer() {
  const [body, setBody] = useState("");
  const createSource = useCreateSource();

  function handleCreate() {
    const trimmed = body.trim();
    if (!trimmed || createSource.isPending) {
      return;
    }
    createSource.mutate({ body: trimmed }, { onSuccess: () => setBody("") });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="무엇이든 붙여넣거나 적어보세요 — 그대로 박제되고, nema가 Digest로 정리한다"
        rows={5}
        className={TEXTAREA_CLASS}
      />
      <Button
        size="xs"
        className="self-end"
        onClick={handleCreate}
        disabled={!body.trim() || createSource.isPending}
      >
        던지기
      </Button>
      {createSource.error && (
        <p className="text-xs text-status-error">
          {getErrorMessage(createSource.error)}
        </p>
      )}
    </div>
  );
}
