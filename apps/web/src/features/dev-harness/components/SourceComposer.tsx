import { useState } from "react";

import { Button, Textarea } from "@nema-io/weave";

import { useCreateSource } from "@web/features/dev-harness/hooks/useCreateSource";
import { getErrorMessage } from "@web/lib/getErrorMessage";

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
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="무엇이든 붙여넣거나 적어보세요"
        rows={5}
        resize="vertical"
        // Textarea 기본값의 dark:focus-visible:border-fg-tertiary/70가 특이도로
        // 이겨서 일반 focus-visible: 오버라이드는 다크에서 안 먹는다(weave-usage.md
        // "함정" 섹션) — 같은 변형(dark:focus-visible:)으로 맞춰야 twMerge가
        // 제대로 교체한다.
        className="rounded-lg bg-surface-raised p-3 focus-visible:border-border-strong dark:focus-visible:border-border-strong"
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
