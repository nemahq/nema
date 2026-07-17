import { Badge, cn, LIST_ITEM_HOVER_CLASSNAME } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  CHANGESET_TYPE_LABEL,
  isOpenChangeset,
} from "@web/features/review/constants";
import type { ChangesetListEntry } from "@web/features/review/types";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetStatusBadge } from "./ChangesetStatusBadge";

interface ChangesetListRowProps {
  entry: ChangesetListEntry;
  onClick?: () => void;
  hideDivider?: boolean;
}

export function ChangesetListRow({
  entry,
  onClick,
  hideDivider,
}: ChangesetListRowProps) {
  const { t } = useTranslation();
  const open = isOpenChangeset(entry.status);
  const typeLabel =
    entry.type === "manual" ? entry.type : CHANGESET_TYPE_LABEL[entry.type];

  return (
    // 구분선을 버튼 폭 그대로 두면 버튼의 rounded-lg 모서리를 따라 선이 살짝
    // 휘어 보여서, 별도 줄로 분리하고 rounded-lg와 같은 반경(2=8px)만큼
    // 인셋해 호버 박스가 평평해지는 지점과 끝을 맞춘다.
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left disabled:pointer-events-none disabled:cursor-default",
          LIST_ITEM_HOVER_CLASSNAME,
        )}
      >
        <Badge variant="neutral" className="shrink-0">
          {typeLabel}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
          <span className="text-fg-tertiary">#{entry.number} · </span>
          {changesetDisplayTitle(entry, t)}
        </span>
        {entry.reverted && (
          <Badge variant="neutral" className="shrink-0">
            {t("review.status_reverted")}
          </Badge>
        )}
        {!open && (
          <ChangesetStatusBadge
            status={entry.status}
            type={entry.type}
            className="shrink-0"
          />
        )}
        <RelativeTime dateTime={entry.createdAt} className="shrink-0" />
      </button>
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}
