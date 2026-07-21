import type { ReactNode } from "react";

import { Text } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { ChangesetStatus } from "@web/features/review/types";

import { ChangesetStatusPill } from "./ChangesetStatusPill";

interface ChangesetDetailHeaderProps {
  title: string;
  changesetNumber: number;
  status: ChangesetStatus;
  time: string;
  actions?: ReactNode;
}

// 상세 화면들이 공유하는 헤더 chrome(제목+번호 / 상태+시각) — 액션만 화면마다
// 다른 슬롯으로 남긴다.
export function ChangesetDetailHeader({
  title,
  changesetNumber,
  status,
  time,
  actions,
}: ChangesetDetailHeaderProps) {
  return (
    <header className="sticky top-0 z-10 -mt-6 flex flex-col gap-2 border-b border-border/50 bg-surface-card pt-6 pb-4">
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
        <ChangesetStatusPill status={status} />
        <RelativeTime dateTime={time} className="text-sm leading-none" />
      </div>
    </header>
  );
}
