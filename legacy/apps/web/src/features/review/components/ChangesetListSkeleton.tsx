import { ChangesetListRowSkeleton } from "./ChangesetListRowSkeleton";

// 페칭 페이지 크기(CHANGESET_LIST_LIMIT_DEFAULT)와는 무관하게, 뷰포트에 실제로
// 보이는 만큼만 흉내낸다 — 화면 밖까지 스켈레톤을 채우는 건 낭비.
const SKELETON_ROW_COUNT = 8;

export function ChangesetListSkeleton() {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
        <ChangesetListRowSkeleton
          key={index}
          index={index}
          hideDivider={index === SKELETON_ROW_COUNT - 1}
        />
      ))}
    </>
  );
}
