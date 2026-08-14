import { NotebookText } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";

export function DigestNavItem() {
  const { t } = useTranslation();
  return (
    <NavItem
      icon={<NotebookText strokeWidth={1.5} className={NAV_ICON_CLASS} />}
      label={t("digest.nav_label")}
      to="/"
      // "/"는 모든 경로의 접두사라 exact 없이는 다른 라우트에서도 계속 active로
      // 잡힌다(TanStack Router의 prefix 매칭 — activeOptions.exact 기본값 false).
      activeOptions={{ exact: true }}
    />
  );
}
