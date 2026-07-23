import { cn, Skeleton } from "@nema-io/weave";

// 실제 라벨 이름 길이가 제각각인 것처럼 스켈레톤 폭도 다양하게 둔다 — 전부 같은
// 폭이면 진짜 데이터가 아니라 UI 장식처럼 보인다. 스피너·"불러오는 중" 텍스트
// 대신 스켈레톤인 건 DraftSpaceSelect와 같은 원칙.
const SEARCH_SKELETON_WIDTHS = ["w-16", "w-24", "w-12"];

export function LabelSearchSkeleton() {
  return (
    <ul className="flex flex-col gap-0.5 py-1">
      {SEARCH_SKELETON_WIDTHS.map((width, index) => (
        <li key={index} className="px-2 py-1">
          <Skeleton className={cn("h-[19px] rounded-[4px]", width)} />
        </li>
      ))}
    </ul>
  );
}
