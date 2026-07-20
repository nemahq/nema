// 이 훅을 쓰는 화면은 전부 SpaceOverview 아래에 있고, 거기서 Space를 못 찾으면
// SpaceNotFound를 렌더하고 끝나 자식이 아예 안 붙는다 — 그래서 여기선 없는 경우가
// 도달 불가능하고, 옵셔널로 내려 소비처마다 방어하게 두는 대신 계약으로 못박는다.
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";

import { useSpacePublicId } from "./useSpacePublicId";

export function useCurrentSpaceId(): string {
  const spacePublicId = useSpacePublicId();
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  if (!space) {
    throw new Error(
      `useCurrentSpaceId found no space for publicId ${spacePublicId} — expected SpaceOverview to have gated on this.`,
    );
  }

  return space.id;
}
