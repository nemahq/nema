// 이 훅을 쓰는 화면은 전부 ChangesetDetailScreen의 게이트 아래에 있고, 거기서 번호가
// 유효하지 않으면 ChangesetNotFound를 렌더하고 끝나 자식이 아예 안 붙는다 — 그래서
// 여기선 없는 경우가 도달 불가능하고, 옵셔널로 내려 소비처마다 방어하게 두는 대신
// 계약으로 못박는다(useCurrentSpaceId와 같은 결).
import { useParams } from "@tanstack/react-router";

import { GetChangesetByNumberInputSchema } from "@nema-io/shared";

export function useChangesetNumber(): number {
  const { changesetNumber } = useParams({ strict: false });
  const parsed = Number(changesetNumber);

  if (
    changesetNumber === undefined ||
    !GetChangesetByNumberInputSchema.shape.number.safeParse(parsed).success
  ) {
    throw new Error(
      `useChangesetNumber got ${String(changesetNumber)} — expected ChangesetDetailScreen to have gated on this.`,
    );
  }

  return parsed;
}
