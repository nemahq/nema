import type { Message, StatusLogType } from "@nema-io/shared";

import type {
  ClientStatusMessage,
  ClientStatusType,
} from "@web/features/session/contexts/ChatLifecycleContext";
import { useTranslation } from "@web/lib/tolgee";
import type { TranslationKey } from "@web/lib/tolgee/types";

import { SearchingStatus } from "./SearchingStatus";
import { StatusIndicator } from "./StatusIndicator";

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

  if (message.content === "searching") {
    return <SearchingStatus />;
  }

  const status = IN_PROGRESS_STATUSES.has(message.content)
    ? "in-progress"
    : "completed";
  const meta = "meta" in message ? message.meta : undefined;
  const label =
    message.content === "draft_saved" && meta?.titles
      ? t(STATUS_LABEL_MAP[message.content], { titles: meta.titles })
      : t(STATUS_LABEL_MAP[message.content]);

  return <StatusIndicator label={label} status={status} />;
}
