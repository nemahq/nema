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
  // 시각 앞에 "이름 · " 형태로 붙는다(DigestReadonlyCard의 authorName 표시와 같은 결).
  reviewerName?: string | null;
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
  reviewerName,
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
        <div className="flex items-center justify-between gap-4">
          <Text
            as="h1"
            size="2xl"
            weight="semibold"
            className="flex min-w-0 items-baseline gap-2"
          >
            <span className="min-w-0 truncate">{title}</span>
            <Text as="span" size="lg" color="tertiary" className="shrink-0">
              #{changesetNumber}
            </Text>
          </Text>
          {actions}
        </div>
        <div className="flex items-center gap-2">
          <ChangesetStatusPill state={state} />
          {badge}
          {/* reviewerName만 truncate, 시각은 shrink-0 — 줄바꿈 방지 자체는
              둘을 하나로 묶어도 되지만, 그러면 이름이 길 때 시각까지 말줄임
              안으로 잘려 아예 안 보일 수 있다. 이름만 줄고 시각은 항상 남아야
              한다. */}
          <div className="flex min-w-0 items-center gap-1">
            {reviewerName && (
              <Text
                as="span"
                size="sm"
                color="tertiary"
                className="min-w-0 truncate"
              >
                {reviewerName} ·
              </Text>
            )}
            <RelativeTime
              dateTime={time}
              className="shrink-0 text-sm leading-none"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
