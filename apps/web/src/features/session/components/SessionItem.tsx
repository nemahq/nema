import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Text } from "@nema-io/weave";

import { useTypewriter } from "@web/hooks/useTypewriter";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { useTranslation } from "@web/lib/tolgee";

import { RenameInput } from "./RenameInput";
import { SessionItemMenu } from "./SessionItemMenu";

interface SessionItemProps {
  sessionId: string;
  title: string | null;
  isActive: boolean;
}

export function SessionItem({
  sessionId,
  title: rawTitle,
  isActive,
}: SessionItemProps) {
  const { t } = useTranslation();
  const animatedTitle = useTypewriter(rawTitle);
  const title = animatedTitle || t("session.untitled");

  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <RenameInput
        sessionId={sessionId}
        currentTitle={rawTitle}
        onEditEnd={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="group relative flex items-center">
      <Link
        to="/session/$sessionId"
        params={{ sessionId }}
        onClick={() => trackEvent("session.navigate", sessionId)}
        className="w-full cursor-pointer truncate rounded-md px-2 py-1.5 pr-8 text-left text-sm transition-colors duration-fast"
        activeProps={{
          className: "bg-surface-raised-hover text-fg-primary font-medium",
        }}
        inactiveProps={{
          className: "text-fg-secondary hover:bg-surface-raised-hover",
        }}
      >
        <Text
          as="span"
          size="base"
          weight={isActive ? "medium" : "normal"}
          color={isActive ? "primary" : "secondary"}
        >
          {title}
        </Text>
      </Link>

      <SessionItemMenu
        sessionId={sessionId}
        onStartEditing={() => setIsEditing(true)}
      />
    </div>
  );
}
