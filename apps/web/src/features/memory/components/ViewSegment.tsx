import { Link } from "@tanstack/react-router";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

type Tab = {
  to: "/memory/overview" | "/memory/history";
  labelKey: TranslationKey;
};

const TABS: readonly Tab[] = [
  { to: "/memory/overview", labelKey: "memory.view_overview" },
  { to: "/memory/history", labelKey: "memory.view_history" },
];

const BASE_CLASS = "px-3 py-1 text-xs transition-colors duration-fast";
const ACTIVE_CLASS = "font-semibold text-fg-primary";
const INACTIVE_CLASS =
  "bg-surface-raised font-medium text-fg-tertiary hover:bg-surface-raised-hover hover:text-fg-secondary";

export function ViewSegment() {
  const { t } = useTranslation();

  return (
    <div className="flex overflow-hidden rounded-md border border-border/50">
      {TABS.map((tab, index) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={
            index === 0 ? BASE_CLASS : `border-l border-border/50 ${BASE_CLASS}`
          }
          activeProps={{ className: ACTIVE_CLASS }}
          inactiveProps={{ className: INACTIVE_CLASS }}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  );
}
