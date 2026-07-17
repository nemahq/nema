import {
  cn,
  LIST_ITEM_HOVER_CLASSNAME,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  CHANGESET_TYPE_ICON,
  CHANGESET_TYPE_LABEL,
  isOpenChangeset,
} from "@web/features/review/constants";
import type { ChangesetListEntry } from "@web/features/review/types";
import {
  changesetAuthorLabel,
  changesetDisplayTitle,
} from "@web/features/review/utils";
import { useUser } from "@web/lib/auth";
import { useTranslation } from "@web/lib/tolgee";

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
  const user = useUser();
  const open = isOpenChangeset(entry.status);
  // manual은 이 리스트에 구조적으로 절대 안 나오지만(constants.ts 참고),
  // CHANGESET_TYPE_ICON/LABEL이 그 타입을 안 다뤄 인덱싱 전에 좁혀야 한다.
  const TypeIcon =
    entry.type === "ingestion" || entry.type === "relation"
      ? CHANGESET_TYPE_ICON[entry.type]
      : null;
  const typeLabelKey =
    entry.type === "manual" ? null : CHANGESET_TYPE_LABEL[entry.type];

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
          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left disabled:pointer-events-none disabled:cursor-default",
          LIST_ITEM_HOVER_CLASSNAME,
        )}
      >
        <div className="flex items-center gap-1.5">
          {TypeIcon && typeLabelKey && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 text-fg-tertiary">
                  <TypeIcon className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{t(typeLabelKey)}</TooltipContent>
            </Tooltip>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
            {changesetDisplayTitle(entry, t)}
          </span>
        </div>
        <div className="text-[11px] leading-[1.4] text-fg-tertiary">
          #{entry.number} · <RelativeTime dateTime={entry.createdAt} />
          {/* 리뷰 대기(open) 항목은 항상 엔진 제안뿐이라(사람이 authorId를
              가질 수 있는 manual·revert는 pending을 절대 거치지 않음,
              07-modeling.md §authorId) 탭 자체가 이미 말해주는 정보라 생략한다.
              작성자는 항상 맨 뒤에 붙여서, 길이가 들쭉날쭉해도 앞의 #번호·시간
              위치는 두 탭에서 흔들리지 않게 한다. */}
          {!open &&
            ` · ${changesetAuthorLabel(entry.authorId, user.displayName, t)}`}
        </div>
      </button>
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}
