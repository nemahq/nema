import { type CSSProperties, useState } from "react";

import { SOURCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Button, cn } from "@nema-io/weave";

import { ACTION_BUTTON_BASE, ChatInput } from "@web/components/ui/ChatInput";
import { useCreateSource } from "@web/features/intake/hooks/useCreateSource";
import { useTranslation } from "@web/lib/tolgee";

const PROGRESS_CLIMB_DURATION_MS = 2_500;

interface SourceComposerProps {
  spaceId: string;
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

  function handleSubmit(content: string) {
    if (createSource.isPending) {
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
        disabled={createSource.isPending}
        submitDisabled={createSource.isPending}
        maxLength={SOURCE_BODY_MAX_LENGTH}
        renderSubmitButton={({ onClick, disabled }) => (
          <Button
            variant="neutral"
            size="sm"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              ACTION_BUTTON_BASE,
              "disabled:bg-surface-raised-hover disabled:text-fg-tertiary disabled:border-transparent",
              "dark:disabled:bg-fg-tertiary/20 dark:disabled:text-fg-tertiary",
              "enabled:bg-fg-secondary enabled:text-surface-card enabled:border-transparent enabled:hover:opacity-80",
              "dark:enabled:bg-fg-primary dark:enabled:text-surface-base",
            )}
          >
            {t("intake.compose_submit")}
          </Button>
        )}
      />
    </div>
  );
}
