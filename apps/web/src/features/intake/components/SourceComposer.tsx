import { type CSSProperties, useState } from "react";

import { SOURCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Button, cn } from "@nema-io/weave";

import { ACTION_BUTTON_BASE, ChatInput } from "@web/components/ui/ChatInput";
import { useCreateSource } from "@web/features/intake/hooks/useCreateSource";
import { useTranslation } from "@web/lib/tolgee";

const PROGRESS_CLIMB_DURATION_MS = 2_500;

interface SourceComposerProps {
  // Space 조회가 끝나기 전엔 아직 없다 — 그동안도 컴포저 자체는 자리를 지키고
  // disabled로만 막는다(로딩 중 컴포저가 통째로 안 보이다 늦게 나타나는 것보다 낫다).
  spaceId?: string;
}

const progressClimbStyle: CSSProperties & {
  "--progress-climb-duration": string;
} = {
  "--progress-climb-duration": `${PROGRESS_CLIMB_DURATION_MS}ms`,
};

export function SourceComposer({ spaceId }: SourceComposerProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const createSource = useCreateSource();
  const disabled = !spaceId || createSource.isPending;

  function handleSubmit(content: string) {
    if (!spaceId || createSource.isPending) {
      return;
    }
    createSource.mutate(
      {
        body: content,
        spaceId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      { onSuccess: () => setBody("") },
    );
  }

  return (
    <div className="relative">
      {createSource.isPendingAfterDelay && (
        <div className="absolute inset-x-4 top-0 z-10 h-0.5 overflow-hidden rounded-full">
          <div
            className="h-full w-0 rounded-full bg-fg-secondary [animation:progress-climb_var(--progress-climb-duration)_ease-out_forwards] dark:bg-fg-primary"
            style={progressClimbStyle}
          />
        </div>
      )}
      <ChatInput
        value={body}
        onChange={setBody}
        onSubmit={handleSubmit}
        placeholder={t("intake.compose_body_placeholder")}
        disabled={disabled}
        submitDisabled={disabled}
        maxLength={SOURCE_BODY_MAX_LENGTH}
        renderSubmitButton={({ onClick, disabled }) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              ACTION_BUTTON_BASE,
              "disabled:bg-surface-raised-hover disabled:text-fg-quaternary",
              "dark:disabled:bg-fg-tertiary/20 dark:disabled:text-fg-quaternary",
              "enabled:bg-fg-secondary enabled:text-surface-card enabled:hover:bg-fg-secondary enabled:hover:opacity-80",
              "dark:enabled:bg-fg-primary dark:enabled:text-surface-base dark:enabled:hover:bg-fg-primary",
            )}
          >
            {t("intake.remember")}
          </Button>
        )}
      />
    </div>
  );
}
