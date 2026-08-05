import type { ReactNode } from "react";

import { Text } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { ChangesetDisplayState } from "@web/features/review/constants";

import { ChangesetStatusPill } from "./ChangesetStatusPill";

interface ChangesetDetailHeaderProps {
  title: string;
  changesetNumber: number;
  state: ChangesetDisplayState;
  // 상태 pill 옆에 붙는 자리 — 관계 판정 화면의 충돌/중복 타입 배지가 여기 들어간다.
  badge?: ReactNode;
  // 한 자리에 현재 살아있는 축 하나만: open이면 연 주체, closed면 닫은 주체
  // (엔진이면 "Nema"). 판정 로직은 여기 두지 않는다 — 호출부가
  // changesetRowAuthorLabel(review/utils.ts, 목록 행과 공유)로 미리 계산해
  // 넘긴다(review-flow.md 관련 슬라이스).
  authorLabel: string;
  time: string;
  actions?: ReactNode;
}

// 상세 화면들이 공유하는 헤더 chrome(제목+번호 / 상태+시각) — 액션만 화면마다
// 다른 슬롯으로 남긴다.
export function ChangesetDetailHeader({
  title,
  changesetNumber,
  state,
  badge,
  authorLabel,
  time,
  actions,
}: ChangesetDetailHeaderProps) {
  return (
    // 배경은 부모의 px-6 여백까지 -mx-6/px-6로 풀칠(스크롤되는 카드가 이 여백에
    // 얹은 절대배치 요소 — 예: 신규 Reference의 added 표시 — 를 가리려면 헤더도
    // 그 폭까지 덮어야 한다). 보더는 안쪽 wrapper에 남겨 원래 폭(카드와 동일,
    // max-w-5xl 콘텐츠 폭) 그대로 유지한다.
    <header
      data-sticky-header
      className="sticky top-0 z-10 -mx-6 -mt-6 bg-surface-card px-6"
    >
      <div className="flex flex-col gap-2 border-b border-border pt-6 pb-4">
        {/* items-start(기존 items-center)가 아니면 제목이 여러 줄로 접힐 때
            actions가 세로 중앙으로 밀려 첫 줄과 어긋난다 — 말줄임 제거(review-flow.md
            관련 슬라이스)로 여러 줄이 실제로 발생하게 되면서 필요해졌다. */}
        <div className="flex items-start justify-between gap-4">
          <Text
            as="h1"
            size="2xl"
            weight="semibold"
            className="flex min-w-0 flex-wrap items-baseline gap-2"
          >
            <span className="min-w-0 break-words">{title}</span>
            <Text as="span" size="lg" color="tertiary" className="shrink-0">
              #{changesetNumber}
            </Text>
          </Text>
          {actions}
        </div>
        <div className="flex items-center gap-2">
          <ChangesetStatusPill state={state} />
          {badge}
          <Text as="div" size="sm" color="tertiary">
            {authorLabel} ·{" "}
            <RelativeTime dateTime={time} className="text-sm leading-none" />
          </Text>
        </div>
      </div>
    </header>
  );
}
