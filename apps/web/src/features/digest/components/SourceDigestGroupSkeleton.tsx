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
// 아이콘 버튼·다이제스트 유형 배지는 반짝이는 모양까지 그리지 않는다 — 로딩과
// 무관하게 항상 같은 모양인 고정 액션/장식이라 예고할 정보가 없다(제목·시각처럼
// 매번 달라지는 값만 흉내낸다). 다만 자리는 남긴다 — 안 남기면 옆에 있는 진짜
// 데이터 스켈레톤(시각·제목)이 실제 위치보다 밀려 있다가 데이터가 오면 옆으로
// 훅 움직이는 것처럼 보인다.
export function SourceDigestGroupSkeleton({
  style,
}: SourceDigestGroupSkeletonProps) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-2 px-2">
        <TextSkeleton size="sm" className="w-32" style={style} />
        <div className="min-w-6 flex-1" />
        <TextSkeleton size="xs" className="w-10" style={style} />
        {/* 원문 보기 버튼(size-7)과 같은 크기의 빈 자리 — 아이콘은 안 그린다. */}
        <div className="size-7 shrink-0" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: DIGEST_ROW_SKELETON_COUNT }).map((_, index) => (
          <div key={index} className="flex items-center gap-2 px-2 py-1.5">
            {/* 유형 배지(아이콘+라벨, 라벨 길이만큼 폭이 들쭉날쭉)와 같은
                자리 — 정확한 폭은 라벨마다 달라 못 맞추지만, 빈 자리라도
                둬야 제목 스켈레톤이 실제 제목 시작 위치에 가깝다. */}
            <div className="h-5 w-16 shrink-0" />
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
