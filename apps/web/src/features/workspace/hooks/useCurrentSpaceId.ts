// 이 훅을 쓰는 화면은 전부 Space를 먼저 거르는 게이트 아래에 있다 — SpaceOverview는
// SpaceNotFound를, changeset 상세는 ChangesetNotFound를 렌더하고 끝나 자식이 아예 안
// 붙는다. 그래서 여기선 없는 경우가 도달 불가능하고, 옵셔널로 내려 소비처마다 방어하게
// 두는 대신 계약으로 못박는다. 새 화면을 이 훅 위에 얹을 땐 그 게이트를 먼저 둬야 한다.
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
