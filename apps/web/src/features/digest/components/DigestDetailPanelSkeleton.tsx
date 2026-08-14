import { Skeleton, TextSkeleton } from "@nema-io/weave";

const BODY_FIELD_SKELETON_WIDTHS = ["100%", "100%", "80%"];

// SourceDetailPanelSkeleton과 같은 원칙 — 헤더(삭제·닫기·시각)는 바깥
// (DigestDetailPanel)이 항상 따로 그리므로 여기서 자리를 맞추지 않는다. 유형
// 배지는 SourceDigestGroupSkeleton과 같은 이유로 모양은 안 흉내낸다 — pill
// 모양이 매번 달라지는 값(제목)보다 장식에 가깝다. 배지가 제목과 다른 행(legacy
// 배치)이라 높이(h-5, Badge 기본 크기 px-2 text-[12px] leading-1.4 + py-0.5에서
// 뽑은 값)만 자리로 남겨, 로딩→데이터 전환 시 제목 줄이 위로 튀지 않게 한다.
export function DigestDetailPanelSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
      <div className="flex flex-col items-start gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        <div className="h-5" />
        {/* TextSkeleton 대신 Skeleton 바 + flex items-center로 직접 채운다 —
            TextSkeleton은 vertical-align: middle로 바를 앉히는데(베이스라인
            기준, 줄 상자 진짜 중앙이 아님), 제목 줄의 지오메트릭 중앙에 맞추려면
            별도 wrapper가 필요하다. h-7·h-3.5는 @nema-io/weave의 Text
            sizeClasses.xl(20px, leading 1.4=28px)에서 뽑은 줄 높이·0.7em 바 높이
            값 — weave 쪽 값이 바뀌면 이 자리도 같이 맞춰야 한다. */}
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
