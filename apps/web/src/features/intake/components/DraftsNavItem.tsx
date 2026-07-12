import { FileText } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { isDraftItem } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4";

// Linear Drafts처럼 대기 중인 초안이 있을 때만 노출 — 다 처리되면 항목 자체가 사라진다
// (intake-flow.md "LNB 초안 버튼 조건부 노출").
export function DraftsNavItem() {
  const { t } = useTranslation();
  const pendingQuery = usePendingSourceListQuery();

  const draftCount = (pendingQuery.data?.items ?? []).filter(
    isDraftItem,
  ).length;

  if (draftCount === 0) {
    return null;
  }

  return (
    <NavItem
      icon={<FileText strokeWidth={1.5} className={NAV_ICON_CLASS} />}
      label={t("workspace.drafts", { count: draftCount })}
      to="/drafts"
    />
  );
}
