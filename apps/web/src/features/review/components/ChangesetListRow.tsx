import { memo } from "react";
import { Link, linkOptions } from "@tanstack/react-router";

import {
  Badge,
  cn,
  LIST_ITEM_HOVER_CLASSNAME,
  Separator,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  CHANGESET_ROW_TYPE_SLOTS,
  type ChangesetDisplayState,
  changesetStateIcon,
  changesetStateMeta,
} from "@web/features/review/constants";
import type { ChangesetType } from "@web/features/review/types";
import {
  changesetDisplayTitle,
  summarizeChangesetEffect,
} from "@web/features/review/utils";
import { useSpacePublicId } from "@web/hooks/useSpacePublicId";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetListRowProps {
  changesetNumber: number;
  title: string | null;
  type: ChangesetType;
  state: ChangesetDisplayState;
  revertDepth: number;
  createdAt: string;
  effectDigest: number;
  effectReference: number;
  hideDivider?: boolean;
}

const CHANGESET_LIST_ROW_CLASSNAME = cn(
  "flex w-full flex-col gap-0.5 px-4 py-3 text-left",
  LIST_ITEM_HOVER_CLASSNAME,
);

export const ChangesetListRow = memo(function ChangesetListRow({
  changesetNumber,
  title,
  type,
  state,
  revertDepth,
  createdAt,
  effectDigest,
  effectReference,
  hideDivider,
}: ChangesetListRowProps) {
  const { t } = useTranslation();
  // 라우트에서 직접 읽는다 — 목록을 거쳐 내려받으면 행마다 같은 값을 나르는 셈이고,
  // 이 값이 바뀔 땐 어차피 Space가 바뀌어 목록이 통째로 다시 그려진다.
  const spacePublicId = useSpacePublicId();
  const { badgeLabelKey, showsEffectSummary } = CHANGESET_ROW_TYPE_SLOTS[type];
  const effectSummary = showsEffectSummary
    ? summarizeChangesetEffect(
        { digest: effectDigest, reference: effectReference },
        t,
      )
    : null;
  const stateIcon = changesetStateIcon(state);
  const stateLabelKey = changesetStateMeta(state).labelKey;
  const stateIconEl =
    stateIcon.kind === "filled" ? (
      <span
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
          stateIcon.bg,
          stateIcon.iconTone,
        )}
      >
        <stateIcon.Icon className="size-2.5" strokeWidth={3} />
      </span>
    ) : (
      <span className={cn("inline-flex shrink-0", stateIcon.tone)}>
        <stateIcon.Icon className="size-4" strokeWidth={2.5} />
      </span>
    );

  return (
    // 구분선을 버튼 폭 그대로 두면 버튼의 rounded-lg 모서리를 따라 선이 살짝
    // 휘어 보여서, 별도 줄로 분리하고 rounded-lg와 같은 반경(2=8px)만큼
    // 인셋해 호버 박스가 평평해지는 지점과 끝을 맞춘다.
    <div>
      {/* cmd/middle click으로 새 탭에서 열 수 있어야 해서 button+onClick이 아니라
          진짜 <a href>를 내는 Link로 렌더한다. relation+open은 changesetDetailRegistry가
          관계 판정 화면으로 갈라 보낸다. */}
      <Link
        {...linkOptions({
          to: "/space/$spacePublicId/changesets/$changesetNumber",
          params: {
            spacePublicId,
            changesetNumber: String(changesetNumber),
          },
        })}
        className={CHANGESET_LIST_ROW_CLASSNAME}
      >
        <div className="flex items-center gap-2.5">
          <Tooltip>
            <TooltipTrigger asChild>{stateIconEl}</TooltipTrigger>
            <TooltipContent side="bottom">{t(stateLabelKey)}</TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Text
              as="span"
              size="sm"
              weight="medium"
              className="min-w-0 truncate"
            >
              {changesetDisplayTitle(
                { title, number: changesetNumber, type, revertDepth },
                t,
              )}
            </Text>
            {badgeLabelKey && (
              <Badge
                variant="outline"
                shape="pill"
                size="sm"
                className="shrink-0"
              >
                {t(badgeLabelKey)}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {/* 2줄을 상태 아이콘이 아니라 타입 아이콘과 좌측 정렬시키기 위한
              자리맞춤용 — 상태 아이콘과 같은 폭(size-4)만 차지하고 안 보인다. */}
          <span aria-hidden="true" className="inline-flex size-4 shrink-0" />
          <Text as="div" size="xs" color="tertiary">
            #{changesetNumber} · <RelativeTime dateTime={createdAt} />
            {effectSummary && ` · ${effectSummary}`}
          </Text>
        </div>
      </Link>
      {!hideDivider && <Separator className="mx-2 w-auto" />}
    </div>
  );
});
