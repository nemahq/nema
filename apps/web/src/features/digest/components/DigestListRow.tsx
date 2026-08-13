import type { DigestListItem } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestListRowProps {
  digest: DigestListItem;
}

// 클릭하면 상세 사이드뷰가 열려야 하지만 그 사이드뷰는 T3이 짓는다(킥오프 "다이제스트
// 행 클릭" 참고) — 자리만 남기고 여기서는 아무 일도 하지 않는다.
function handleDigestClick() {
  // TODO(T3): 다이제스트 상세 사이드뷰를 연다.
}

// weave Button은 자체 타이포(text-[13px] font-semibold)를 강제해 라벨 텍스트가
// Text 컴포넌트의 크기 스케일을 못 따른다(weave-usage.md Button "안 쓴다" 행) —
// 이 행은 배지·제목 타이포를 그대로 노출해야 해서 raw button을 쓴다.
export function DigestListRow({ digest }: DigestListRowProps) {
  return (
    <button
      type="button"
      onClick={handleDigestClick}
      className="flex w-full min-w-0 items-center gap-2 py-1 text-left"
    >
      <DigestTypeBadge type={digest.type} />
      <Text as="span" size="sm" className="min-w-0 truncate">
        {digest.title}
      </Text>
    </button>
  );
}
