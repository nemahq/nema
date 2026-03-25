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
  "answering",
  "draft_creating",
]);

const STATUS_LABEL_MAP: Record<
  StatusLogType | ClientStatusType,
  TranslationKey
> = {
  thinking: "session.status_thinking",
  searching: "session.status_searching",
  answering: "session.status_answering",
  draft_creating: "session.status_draft_creating",
  draft_created: "session.status_draft_created",
  draft_edited: "session.status_draft_edited",
  draft_cancelled: "session.status_draft_cancelled",
  draft_saved: "session.status_draft_saved",
  retrieval_answered: "session.status_retrieval_answered",
};

type StatusSource =
  | Extract<Message, { type: "status" }>
  | Pick<ClientStatusMessage, "type" | "content">;

interface StatusMessageProps {
  message: StatusSource;
}

export function StatusMessage({ message }: StatusMessageProps) {
  const { t } = useTranslation();
  const inProgress = IN_PROGRESS_STATUSES.has(message.content);

  const meta = "meta" in message ? message.meta : undefined;
  const label =
    message.content === "draft_saved" && meta?.titles
      ? t(STATUS_LABEL_MAP[message.content], { titles: meta.titles })
      : t(STATUS_LABEL_MAP[message.content]);

  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-fg-tertiary">
      <Circle
        className={`size-2 fill-current ${inProgress ? "animate-pulse" : "text-status-success"}`}
      />
      <span>{label}</span>
    </div>
  );
}
