import type { ReactNode } from "react";

import type { Message, StatusLogType } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";
import type { TranslationKey } from "@web/lib/tolgee/types";

const STATUS_LABEL_MAP: Record<StatusLogType, TranslationKey> = {
  draft_creating: "session.draft_creating",
  draft_created: "session.status_draft_created",
  draft_edited: "session.status_draft_edited",
  draft_cancelled: "session.status_draft_cancelled",
  draft_saved: "session.status_draft_saved",
};

interface StatusMessageProps {
  message: Extract<Message, { type: "status" }>;
  icon?: ReactNode;
}

export function StatusMessage({ message, icon }: StatusMessageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-fg-tertiary">
      {icon}
      <span>{t(STATUS_LABEL_MAP[message.content])}</span>
    </div>
  );
}
