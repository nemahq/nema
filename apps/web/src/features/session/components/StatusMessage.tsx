import type { Message, StatusLogType } from "@nema-io/shared";
import { Circle } from "@nema-io/weave/icons";

import type {
  ClientStatusMessage,
  ClientStatusType,
} from "@web/features/session/contexts/ChatStreamContext";
import { useTranslation } from "@web/lib/tolgee";
import type { TranslationKey } from "@web/lib/tolgee/types";

const IN_PROGRESS_STATUSES = new Set<StatusLogType | ClientStatusType>([
  "thinking",
  "searching",
  "draft_creating",
]);

const STATUS_LABEL_MAP: Record<
  StatusLogType | ClientStatusType,
  TranslationKey
> = {
  thinking: "session.status_thinking",
  searching: "session.status_searching",
  draft_creating: "session.status_draft_creating",
  draft_created: "session.status_draft_created",
  draft_edited: "session.status_draft_edited",
  draft_cancelled: "session.status_draft_cancelled",
};

interface StatusMessageProps {
  message:
    | Extract<Message, { type: "status" }>
    | Pick<ClientStatusMessage, "type" | "content">;
}

export function StatusMessage({ message }: StatusMessageProps) {
  const { t } = useTranslation();
  const inProgress = IN_PROGRESS_STATUSES.has(message.content);

  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-fg-tertiary">
      <Circle
        className={`size-2 fill-current ${inProgress ? "animate-pulse" : "text-status-success"}`}
      />
      <span>{t(STATUS_LABEL_MAP[message.content])}</span>
    </div>
  );
}
