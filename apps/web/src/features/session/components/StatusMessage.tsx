import type { ReactNode } from "react";

import type { Message } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";
import type { TranslationKey } from "@web/lib/tolgee/types";

const STATUS_LABEL_MAP: Record<string, TranslationKey> = {
  draft_created: "session.status_draft_created",
  draft_edited: "session.status_draft_edited",
  draft_cancelled: "session.status_draft_cancelled",
  draft_saved: "session.status_draft_saved",
};

export function StatusMessage({
  message,
  icon,
}: {
  message: Message;
  icon?: ReactNode;
}) {
  const { t } = useTranslation();
  const labelKey = STATUS_LABEL_MAP[message.content];

  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-fg-tertiary">
      {icon}
      <span>{labelKey ? t(labelKey) : message.content}</span>
    </div>
  );
}
