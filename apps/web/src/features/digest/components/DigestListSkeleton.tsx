import { SourceDigestGroupSkeleton } from "./SourceDigestGroupSkeleton";

const SKELETON_STAGGER_DELAY_MS = 60;

interface DigestListSkeletonProps {
  count: number;
}

// 첫 진입(×3)과 다음 페이지(×1)가 count만 다르게 나눠 쓴다
// (legacy ChangesetListSkeleton과 같은 구조).
export function DigestListSkeleton({ count }: DigestListSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <SourceDigestGroupSkeleton
          key={index}
          style={{ animationDelay: `${index * SKELETON_STAGGER_DELAY_MS}ms` }}
        />
      ))}
    </>
  );
}
