import { useEffect, useRef, useState } from "react";

import { SOURCE_TITLE_MAX_LENGTH } from "@nema-io/shared";
import { Alert } from "@nema-io/weave";

import { useUpdateSourceTitle } from "@web/features/intake/hooks/useUpdateSourceTitle";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

interface DraftTitleInputProps {
  sourceId: string;
  initialTitle: string | null;
  readOnly?: boolean;
}

export function DraftTitleInput({
  sourceId,
  initialTitle,
  readOnly,
}: DraftTitleInputProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const updateTitleMutation = useUpdateSourceTitle();

  useEffect(function focusTitleAtEnd() {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // 최초 마운트 시 한 번만 — draft가 바뀌면 패널 자체가 다시 마운트된다.
  }, []);

  // SourceUpdateTitleInputSchema가 title min(1)을 강제해 빈 제목 저장 자체가 안
  // 된다 — 지우고 나가면 그냥 저장을 시도하지 않고 이전 제목으로 남는다.
  function handleBlur() {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === (initialTitle ?? "")) {
      return;
    }
    updateTitleMutation.mutate({ sourceId, title: trimmed });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={t("intake.draft_untitled")}
        maxLength={SOURCE_TITLE_MAX_LENGTH}
        aria-invalid={updateTitleMutation.isError}
        readOnly={readOnly}
        className="bg-transparent px-6 pt-4 text-xl font-bold text-fg-primary outline-none placeholder:text-fg-quaternary"
      />
      {updateTitleMutation.isError && (
        <div className="px-6 pt-2">
          <Alert variant="error">
            {getErrorMessage(updateTitleMutation.error)}
          </Alert>
        </div>
      )}
    </>
  );
}
