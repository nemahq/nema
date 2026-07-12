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

  // 조회 실패로 개수를 모르는 상태를 "0개"로 오인해 항목을 숨기지 않는다 — 실제 초안이
  // 있는데도 조용히 진입점이 사라지는 것보다는, 눌러서 /drafts의 에러 상태를 보는 편이 낫다.
  if (draftCount === 0 && !pendingQuery.isError) {
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
