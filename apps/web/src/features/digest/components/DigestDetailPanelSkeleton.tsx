import { Skeleton, TextSkeleton } from "@nema-io/weave";

const BODY_FIELD_SKELETON_WIDTHS = ["100%", "100%", "80%"];

// SourceDetailPanelSkeleton과 같은 원칙 — 헤더(삭제·닫기)는 바깥
// (DigestDetailPanel)이 항상 따로 그리므로 여기서 자리를 맞추지 않는다. 모양은
// CandidateCardFrame 워시 구역(유형 배지 + 제목 + 시각) + 본문 칸에 맞춘다.
export function DigestDetailPanelSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
      <div className="flex flex-col gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          <TextSkeleton size="xl" className="w-1/2 max-w-80" />
        </div>
        <TextSkeleton size="xs" className="w-16" />
      </div>
      <div className="mt-2 flex flex-col gap-3 pl-2">
        {BODY_FIELD_SKELETON_WIDTHS.map((width, index) => (
          <div key={index} className="flex flex-col gap-1">
            <TextSkeleton size="sm" className="w-20" />
            <TextSkeleton size="base" style={{ width }} />
          </div>
        ))}
      </div>
    </div>
  );
}
