import { Avatar } from "@nema-io/weave";
import { SlidersHorizontal } from "@nema-io/weave/icons";

import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

export type SettingsSection = "account" | "preferences";

function navItemClass(active: boolean): string {
  // 링 대신 배경 톤으로 키보드 포커스를 표시한다(hover와 같은 톤 재사용) —
  // PM이 링 스타일을 빼달라고 했지만, 포커스 표시 자체를 완전히 없애는 건
  // conventions.md의 "MUST NOT remove focus styles" 규칙과 충돌해 대체했다.
  return `flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-fast outline-none focus-visible:bg-surface-raised-hover ${
    active
      ? "bg-surface-raised-hover text-fg-primary"
      : "text-fg-tertiary hover:bg-surface-raised-hover hover:text-fg-secondary"
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
      className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-surface-raised p-4"
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
