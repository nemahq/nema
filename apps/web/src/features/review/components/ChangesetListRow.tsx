import { Link } from "@tanstack/react-router";

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
  summarizeChangesetEffect,
} from "@web/features/review/utils";
import { useUser } from "@web/lib/auth";
import { asLinkProps, type LooseLinkTarget } from "@web/lib/link";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetListRowProps extends LooseLinkTarget {
  entry: ChangesetListEntry;
  hideDivider?: boolean;
}

export function ChangesetListRow({
  entry,
  to,
  params,
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
  const effectSummary = summarizeChangesetEffect(entry.effect, t);

  const content = (
    <>
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
            "누가·언제 했는가"가 "무엇을 했는가"(effect)보다 먼저 오는 게
            자연스러운 서술 순서라 시간 바로 뒤에 둔다. */}
        {!open &&
          ` · ${changesetAuthorLabel(entry.authorId, user.displayName, t)}`}
        {effectSummary && ` · ${effectSummary}`}
      </div>
    </>
  );

  const rowClassName = cn(
    "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left",
    to ? LIST_ITEM_HOVER_CLASSNAME : "cursor-default",
  );

  return (
    // 구분선을 버튼 폭 그대로 두면 버튼의 rounded-lg 모서리를 따라 선이 살짝
    // 휘어 보여서, 별도 줄로 분리하고 rounded-lg와 같은 반경(2=8px)만큼
    // 인셋해 호버 박스가 평평해지는 지점과 끝을 맞춘다.
    <div>
      {to ? (
        // cmd/middle click으로 새 탭에서 열 수 있어야 해서 button+onClick이
        // 아니라 진짜 <a href>를 내는 Link로 렌더한다.
        <Link {...asLinkProps({ to, params })} className={rowClassName}>
          {content}
        </Link>
      ) : (
        <div className={rowClassName}>{content}</div>
      )}
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}
