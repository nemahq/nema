import { Badge } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

// 되살리기 버튼 없음 — BE에 아직 restore/unarchive RPC가 없다(archive_reference만
// 존재, active→archived 단방향). 되돌아갈 방법이 필요해지면 그 계약부터 확정해야 한다.
export function ReferenceArchivedBanner() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center rounded-lg border border-border bg-surface-raised px-3 py-2">
      <Badge variant="neutral">{t("reference.archived_badge")}</Badge>
    </div>
  );
}
