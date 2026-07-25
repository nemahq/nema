import { Avatar } from "@nema-io/weave";
import { SlidersHorizontal } from "@nema-io/weave/icons";

import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

export type SettingsSection = "account" | "preferences";

function navItemClass(active: boolean): string {
  return `flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-fast ${
    active
      ? "bg-surface-raised-hover/75 text-fg-primary"
      : "text-fg-tertiary hover:bg-surface-raised-hover/75 hover:text-fg-secondary focus-visible:bg-surface-raised-hover/75 focus-visible:text-fg-secondary"
  }`;
}

interface SettingsNavProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export function SettingsNav({ section, onSectionChange }: SettingsNavProps) {
  const { t } = useTranslation();
  const user = useUser();
  const userInitial = user.displayName.charAt(0).toUpperCase();

  return (
    <nav
      aria-label={t("settings.settings")}
      className="flex w-44 shrink-0 flex-col gap-0.5 bg-surface-raised px-2 py-4 dark:bg-surface-card"
    >
      <button
        type="button"
        aria-current={section === "account" ? "true" : undefined}
        onClick={() => onSectionChange("account")}
        className={navItemClass(section === "account")}
      >
        <Avatar
          src={user.avatarUrl}
          fallback={userInitial}
          className="size-5"
        />
        <span className="truncate">{user.displayName}</span>
      </button>

      <button
        type="button"
        aria-current={section === "preferences" ? "true" : undefined}
        onClick={() => onSectionChange("preferences")}
        className={navItemClass(section === "preferences")}
      >
        <SlidersHorizontal className="size-4" />
        {t("settings.nav_preferences")}
      </button>
    </nav>
  );
}
