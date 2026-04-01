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
  | Pick<ClientStatusMessage, "type" | "content" | "meta">;

interface StatusMessageProps {
  message: StatusSource;
}

export function StatusMessage({ message }: StatusMessageProps) {
  const { t } = useTranslation();
  const meta = "meta" in message ? message.meta : undefined;

  if (message.content === "searching") {
    const entities = meta && "entities" in meta ? (meta.entities ?? []) : [];
    return <SearchingStatus entities={entities} />;
  }

  const inProgress = IN_PROGRESS_STATUSES.has(message.content);
  const titles = meta && "titles" in meta ? meta.titles : undefined;
  const label =
    message.content === "draft_saved" && titles
      ? t(STATUS_LABEL_MAP[message.content], { titles })
      : t(STATUS_LABEL_MAP[message.content]);

  return <StatusIndicator label={label} inProgress={inProgress} />;
}
