import { TextSkeleton } from "@nema-io/weave";

const BODY_FIELD_SKELETON_WIDTHS = ["100%", "100%", "80%"];

// SourceDetailPanelSkeleton과 같은 원칙 — 헤더(삭제·닫기·시각)는 바깥
// (DigestDetailPanel)이 항상 따로 그리므로 여기서 자리를 맞추지 않는다. 유형
// 배지는 SourceDigestGroupSkeleton과 같은 이유로 뺀다 — pill 모양을 흉내내는
// 게 매번 달라지는 값(제목)보다 장식에 가깝다.
export function DigestDetailPanelSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
      <div className="flex flex-col gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        <TextSkeleton size="xl" className="w-1/2 max-w-80" />
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
