import type { DigestListItem } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestListRowProps {
  digest: DigestListItem;
}

// TODO(T3): 클릭하면 다이제스트 상세 사이드뷰를 연다(킥오프 "다이제스트 행 클릭" 참고).
// 아직 갈 곳이 없어 지금은 비인터랙티브로 둔다 — 진짜 <button>에 no-op 핸들러를
// 달면 포커스·스크린리더 낭독·Enter/Space 반응까지 약속해놓고 아무 반응이 없는
// "고장난 버튼"으로 인지된다. T3이 실제 클릭 동작을 넣을 때 button으로 바꾼다.
export function DigestListRow({ digest }: DigestListRowProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-1">
      <DigestTypeBadge type={digest.type} />
      <Text as="span" size="sm" className="min-w-0 truncate">
        {digest.title}
      </Text>
    </div>
  );
}
