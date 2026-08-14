import { TextSkeleton } from "@nema-io/weave";

// SourceDigestGroupSkeleton과 같은 원칙 — 칩·아이콘·조사 같은 모양은 안 그리고,
// 매번 달라지는 값(줄 폭)만 흉내낸다. 실제 줄 수는 로딩 전에 알 수 없어 2줄로
// 고정한다(로딩→데이터 전환 시 줄 수가 튈 수 있음, 같은 타협).
const RELATION_ROW_SKELETON_WIDTHS = ["w-2/5", "w-1/2"];

export function DigestRelationsBlockSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2">
      <TextSkeleton size="sm" className="w-28" />
      <div className="flex flex-col gap-1.5">
        {RELATION_ROW_SKELETON_WIDTHS.map((width, index) => (
          <TextSkeleton key={index} size="sm" className={width} />
        ))}
      </div>
    </div>
  );
}
