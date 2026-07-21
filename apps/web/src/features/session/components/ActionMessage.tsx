import { useEffect } from "react";

import type { Message } from "@nema-io/shared";
import { Button, Kbd, Text } from "@nema-io/weave";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useTranslation } from "@web/lib/tolgee";

type ActionMessageData = Extract<Message, { type: "action" }>;

interface ActionMessageProps {
  message: ActionMessageData;
}

export function ActionMessage({ message }: ActionMessageProps) {
  const { t } = useTranslation();
  const { confirmDraftIntent, pendingConfirmation } = useChatLifecycle();
  const { payload } = message;

  const isPending =
    payload.actionType === "draft_intent_confirmation" &&
    payload.status === "pending" &&
    pendingConfirmation?.actionMessageId === message.id;

  useEffect(
    function handleDraftIntentShortcuts() {
      if (!isPending) {
        return;
      }

      function onKeyDown(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
          return;
        }

        if (e.key === "1") {
          e.preventDefault();
          confirmDraftIntent("append");
        } else if (e.key === "2") {
          e.preventDefault();
          confirmDraftIntent("replace");
        }
      }

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    },
    [isPending, confirmDraftIntent],
  );

  if (!isPending) {
    return null;
  }

  return (
    <div className="py-2">
      <Text size="sm" color="secondary" className="mb-3">
        {t("session.draft_intent_question", {
          draftContext: payload.draftContext,
        })}
      </Text>
      <div className="flex gap-2">
        <Button
          variant="neutral"
          size="sm"
          onClick={() => confirmDraftIntent("append")}
        >
          {t("session.draft_intent_append")}
          <Kbd>1</Kbd>
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => confirmDraftIntent("replace")}
        >
          {t("session.draft_intent_replace")}
          <Kbd>2</Kbd>
        </Button>
      </div>
    </div>
  );
}
