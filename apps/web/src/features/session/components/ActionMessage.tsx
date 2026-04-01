import { useEffect } from "react";

import type { Message } from "@nema-io/shared";
import { Button, cn, Kbd } from "@nema-io/weave";

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

  const isConfirmation = payload.actionType === "draft_intent_confirmation";
  const isPending =
    isConfirmation &&
    payload.status === "pending" &&
    pendingConfirmation?.actionMessageId === message.id;
  const isResolved = isConfirmation && payload.status === "resolved";

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

  if (!isConfirmation) {
    return null;
  }

  return (
    <div className="py-2">
      <p className="mb-3 text-sm text-fg-secondary">
        {t("session.draft_intent_question", {
          draftContext: payload.draftContext,
        })}
      </p>
      <div className="flex gap-2">
        <Button
          variant={
            isResolved && payload.selectedOption === "append"
              ? "primary"
              : "neutral"
          }
          size="sm"
          disabled={isResolved}
          onClick={() => confirmDraftIntent("append")}
          className={cn(
            isResolved && payload.selectedOption !== "append" && "opacity-40",
          )}
        >
          {t("session.draft_intent_append")}
          {isPending && <Kbd>1</Kbd>}
        </Button>
        <Button
          variant={
            isResolved && payload.selectedOption === "replace"
              ? "primary"
              : "neutral"
          }
          size="sm"
          disabled={isResolved}
          onClick={() => confirmDraftIntent("replace")}
          className={cn(
            isResolved && payload.selectedOption !== "replace" && "opacity-40",
          )}
        >
          {t("session.draft_intent_replace")}
          {isPending && <Kbd>2</Kbd>}
        </Button>
      </div>
    </div>
  );
}
