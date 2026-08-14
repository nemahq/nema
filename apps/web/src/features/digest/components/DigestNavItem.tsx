import { Package } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";

// Package — 빈 상태 아이콘(DigestListEmptyState의 PackageOpen)과 짝을 맞춘다.
// 원문(FileText)에서 뽑아낸 다이제스트가 "쌓인 인벤토리"라는 이 화면의 은유를
// 그대로 이어받아, 닫힌 상자(쌓여 있음)/열린 상자(비어 있음)로 상태를 가른다.
export function DigestNavItem() {
  const { t } = useTranslation();
  return (
    <NavItem
      icon={<Package strokeWidth={1.5} className={NAV_ICON_CLASS} />}
      label={t("digest.nav_label")}
      to="/"
      // "/"는 모든 경로의 접두사라 exact 없이는 다른 라우트에서도 계속 active로
      // 잡힌다(TanStack Router의 prefix 매칭 — activeOptions.exact 기본값 false).
      activeOptions={{ exact: true }}
    />
  );
}
