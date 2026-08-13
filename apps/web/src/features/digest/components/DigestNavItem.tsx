import { LayoutList } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";

export function DigestNavItem() {
  const { t } = useTranslation();
  return (
    <NavItem
      icon={<LayoutList strokeWidth={1.5} className={NAV_ICON_CLASS} />}
      label={t("digest.nav_label")}
      to="/"
    />
  );
}
