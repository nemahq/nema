import type { ReactNode } from "react";
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
  CHANGESET_TYPE_LABEL,
  changesetStatusIcon,
  changesetStatusMeta,
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

interface RowIconTooltipProps {
  label: string;
  children: ReactNode;
}

function RowIconTooltip({ label, children }: RowIconTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChangesetListRow({
  entry,
  to,
  params,
  search,
  hideDivider,
}: ChangesetListRowProps) {
  const { t } = useTranslation();
  const user = useUser();
  // revert는 라벨을 안 낸다 — 제목 자체가 "{원본 제목} 되돌림"으로 이미 되돌리기임을
  // 말해주게 될 예정이라(별도 후속 작업), 배지까지 얹으면 같은 정보의 중복 신호가 된다.
  const typeLabelKey =
    entry.type === "ingestion" || entry.type === "relation"
      ? CHANGESET_TYPE_LABEL[entry.type]
      : null;
  // effect 요약은 digest·reference만 다뤄(summarizeChangesetEffect 주석 참고) —
  // ingestion 타입 changeset에서만 그 두 필드가 의미 있는 카운트를 갖는다.
  // relation·revert에서 이대로 부르면 실제 relation/statement effect가 있어도
  // 늘 빈 문자열로 보여 조용히 정보가 사라진다.
  const effectSummary =
    entry.type === "ingestion"
      ? summarizeChangesetEffect(entry.effect, t)
      : null;
  const statusIcon = changesetStatusIcon(entry.status);
  const statusLabelKey = changesetStatusMeta(entry.status).labelKey;
  const statusIconEl =
    statusIcon.kind === "filled" ? (
      <span
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
          statusIcon.bg,
          statusIcon.iconTone,
        )}
      >
        <statusIcon.Icon className="size-2.5" strokeWidth={3} />
      </span>
    ) : (
      <span className={cn("inline-flex shrink-0", statusIcon.tone)}>
        <statusIcon.Icon className="size-4" strokeWidth={2.5} />
      </span>
    );

  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <RowIconTooltip label={t(statusLabelKey)}>
          {statusIconEl}
        </RowIconTooltip>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-fg-primary">
            {changesetDisplayTitle(entry, t)}
          </span>
          {typeLabelKey && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-fg-tertiary">
              {t(typeLabelKey)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {/* 2줄을 상태 아이콘이 아니라 타입 아이콘과 좌측 정렬시키기 위한
            자리맞춤용 — 상태 아이콘과 같은 폭(size-4)만 차지하고 안 보인다. */}
        <span aria-hidden="true" className="inline-flex size-4 shrink-0" />
        <div className="text-[11px] leading-[1.4] text-fg-tertiary">
          #{entry.number} · <RelativeTime dateTime={entry.createdAt} />
          {/* "누가·언제 했는가"가 "무엇을 했는가"(effect)보다 먼저 오는 게
              자연스러운 서술 순서라 시간 바로 뒤에 둔다. */}
          {` · ${changesetAuthorLabel(entry.authorId, user.displayName, t)}`}
          {effectSummary && ` · ${effectSummary}`}
        </div>
      </div>
    </>
  );

  const rowClassName = cn(
    "flex w-full flex-col gap-0.5 px-4 py-3 text-left",
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
        <Link {...asLinkProps({ to, params, search })} className={rowClassName}>
          {content}
        </Link>
      ) : (
        <div className={rowClassName}>{content}</div>
      )}
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}
