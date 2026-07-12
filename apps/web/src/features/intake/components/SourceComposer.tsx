import { useState } from "react";

import { ChatInput } from "@web/components/ui/ChatInput";
import { useCreateSource } from "@web/features/intake/hooks/useCreateSource";
import { useTranslation } from "@web/lib/tolgee";

interface SourceComposerProps {
  spaceId: string;
}

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
    <ChatInput
      value={body}
      onChange={setBody}
      onSubmit={handleSubmit}
      placeholder={t("intake.compose_body_placeholder")}
      submitDisabled={createSource.isPending}
    />
  );
}
