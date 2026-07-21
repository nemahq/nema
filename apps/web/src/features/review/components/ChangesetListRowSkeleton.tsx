import { Skeleton, TextSkeleton } from "@nema-io/weave";

// ChangesetListRow의 1줄(아이콘+제목)·2줄 구조를 그대로 흉내내야 로딩→데이터
// 전환 시 행 높이가 튀지 않는다.
const SKELETON_TITLE_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"];
const SKELETON_STAGGER_DELAY_MS = 60;

interface ChangesetListRowSkeletonProps {
  index: number;
  hideDivider: boolean;
}

export function ChangesetListRowSkeleton({
  index,
  hideDivider,
}: ChangesetListRowSkeletonProps) {
  const delay = { animationDelay: `${index * SKELETON_STAGGER_DELAY_MS}ms` };

  return (
    <div>
      <div className="flex w-full flex-col gap-0.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-4 shrink-0 rounded-full" style={delay} />
          <TextSkeleton
            size="sm"
            className={
              SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length]
            }
            style={delay}
          />
        </div>
        <div className="flex items-center gap-2.5">
          {/* 실제 행의 2줄 자리맞춤용 스페이서(ChangesetListRow 참고)와 같은 폭 */}
          <span aria-hidden="true" className="inline-flex size-4 shrink-0" />
          <TextSkeleton size="xs" className="w-1/4" style={delay} />
        </div>
      </div>
      {!hideDivider && <div className="mx-2 border-b border-border/50" />}
    </div>
  );
}
