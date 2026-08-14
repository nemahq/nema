import { Skeleton, TextSkeleton } from "@nema-io/weave";

const BODY_FIELD_SKELETON_WIDTHS = ["100%", "100%", "80%"];

// SourceDetailPanelSkeleton과 같은 원칙 — 헤더(삭제·닫기·시각)는 바깥
// (DigestDetailPanel)이 항상 따로 그리므로 여기서 자리를 맞추지 않는다. 유형
// 배지는 SourceDigestGroupSkeleton과 같은 이유로 뺀다 — pill 모양을 흉내내는
// 게 매번 달라지는 값(제목)보다 장식에 가깝다.
export function DigestDetailPanelSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
      <div className="flex flex-col gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        {/* TextSkeleton 대신 Skeleton 바 + flex items-center로 직접 채운다 —
            TextSkeleton은 vertical-align: middle로 바를 앉히는데(베이스라인
            기준, 줄 상자 진짜 중앙이 아님), 실제 워시 행(배지+제목)은
            flex items-center라 지오메트릭 중앙이라서 TextSkeleton 혼자면
            아래로 살짝 치우쳐 보인다(DigestTypeBadge 아이콘 정렬과 같은
            원인). h-7·h-3.5는 Text sizeClasses.xl(20px, leading 1.4=28px)의
            줄 높이·0.7em 바 높이와 같은 값. */}
        <div className="flex h-7 items-center">
          <Skeleton className="h-3.5 w-1/2 max-w-80 rounded-md" />
        </div>
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
