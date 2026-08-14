import type { CSSProperties } from "react";

import { Skeleton, TextSkeleton } from "@nema-io/weave";

// 실제 행 수는 원문마다 제각각이라 스켈레톤이 맞출 수 없다 — 3개로 고정하고
// 로딩→데이터 전환 시 높이가 튀는 건 감수한다.
const DIGEST_ROW_SKELETON_COUNT = 3;
const DIGEST_TITLE_SKELETON_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"];

interface SourceDigestGroupSkeletonProps {
  style?: CSSProperties;
}

// SourceDigestGroup의 2층 구조(원문 헤더 + 다이제스트 행)를 그대로 흉내내야
// 로딩→데이터 전환 시 행 높이가 튀지 않는다.
export function SourceDigestGroupSkeleton({
  style,
}: SourceDigestGroupSkeletonProps) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-2">
        <TextSkeleton size="sm" className="w-32" style={style} />
        <div className="min-w-6 flex-1" />
        <TextSkeleton size="xs" className="w-10" style={style} />
        <Skeleton className="size-7 shrink-0 rounded-md" style={style} />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: DIGEST_ROW_SKELETON_COUNT }).map((_, index) => (
          <div key={index} className="flex items-center gap-2 px-2 py-1">
            <Skeleton
              className="h-5 w-16 shrink-0 rounded-full"
              style={style}
            />
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
