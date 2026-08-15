import type { ReactNode } from "react";

import { Circle } from "@nema-io/weave/icons";

interface DigestFieldBulletProps {
  children: ReactNode;
}

// 항목이 여러 줄로 늘어나도 글머리 기호 아래로 흐르지 않게 본문을 한 칸으로 묶는다.
// mt-2.5·size-1.5는 DigestReadonlyBodyFields의 list 불릿과 같은 값 — 첫 줄이
// 둘 다 size="base"라 같은 오프셋이어야 첫 줄 높이 중앙에 맞는다.
export function DigestFieldBullet({ children }: DigestFieldBulletProps) {
  return (
    <li className="flex items-start gap-2">
      <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
    </li>
  );
}
