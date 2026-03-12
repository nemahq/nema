import { memo } from "react";
import { Link } from "@tanstack/react-router";

import type { SessionSummary } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

export const SessionItem = memo(function SessionItem({
  session,
}: {
  session: SessionSummary;
}) {
  const { t } = useTranslation();
  const title = session.title ?? t("session.untitled");

  return (
    <Link
      to="/context/$sessionId"
      params={{ sessionId: session.id }}
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
