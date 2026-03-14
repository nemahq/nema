import { memo } from "react";
import { Link } from "@tanstack/react-router";

import type { SessionSummary } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { useTranslation } from "@web/lib/tolgee";

export const SessionItem = memo(function SessionItem({
  session,
}: {
  session: SessionSummary;
}) {
  const { t } = useTranslation();
  const trackEvent = useTrackEvent();
  const title = session.title ?? t("session.untitled");

  return (
    <Link
      to="/session/$sessionId"
      params={{ sessionId: session.id }}
      onClick={() => trackEvent("session.navigate", session.id)}
      className="w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast"
      activeProps={{
        className: "bg-surface-raised-hover text-fg-primary font-medium",
      }}
      inactiveProps={{
        className: "text-fg-secondary hover:bg-surface-raised-hover",
      }}
    >
      {title}
    </Link>
  );
});
