import type { CSSProperties } from "react";

import { TextSkeleton } from "@nema-io/weave";

// 실제 행 수는 원문마다 제각각이라 스켈레톤이 맞출 수 없다 — 3개로 고정하고
// 로딩→데이터 전환 시 높이가 튀는 건 감수한다.
const DIGEST_ROW_SKELETON_COUNT = 3;
const DIGEST_TITLE_SKELETON_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"];

interface SourceDigestGroupSkeletonProps {
  style?: CSSProperties;
}

// SourceDigestGroup의 2층 구조(원문 헤더 + 다이제스트 행)를 흉내내되, 원문 보기
// 버튼·다이제스트 유형 배지는 반짝이는 모양은 안 그린다 — 로딩과 무관하게 항상
// 같은 모양인 고정 액션/장식이라 예고할 정보가 없다(제목·시각처럼 매번 달라지는
// 값만 흉내낸다). 다만 자리(size-6·size-5, 각각 Button icon-xs·DigestTypeIcon
// Badge 기본 크기)는 남긴다 — 안 남기면 옆 시각·제목이 실제 위치보다 밀려 나와
// 로딩→데이터 전환 때 튄다. px-3·gap-3는 SourceDigestGroup·DigestListRow의
// 실제 여백과 같은 값.
export function SourceDigestGroupSkeleton({
  style,
}: SourceDigestGroupSkeletonProps) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-2 px-3">
        <TextSkeleton size="sm" className="w-32" style={style} />
        <div className="min-w-6 flex-1" />
        <TextSkeleton size="xs" className="w-10" style={style} />
        <div className="size-6 shrink-0" />
      </div>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: DIGEST_ROW_SKELETON_COUNT }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-1.5">
            <div className="size-5 shrink-0" />
            <TextSkeleton
              size="sm"
              className={
                DIGEST_TITLE_SKELETON_WIDTHS[
                  index % DIGEST_TITLE_SKELETON_WIDTHS.length
                ]
              }
              style={style}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
