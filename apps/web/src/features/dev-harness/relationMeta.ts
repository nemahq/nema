import { type BadgeVariant } from "@nema-io/weave";

import type { RelationType } from "@web/features/dev-harness/types";

// 관계 끝점 진술을 못 찾았을 때(데이터 이상) 자리에 보이는 표시 — 빈 행으로 숨기지 않는다
export const MISSING_STATEMENT_CONTENT = "(내용 없음)";

export const RELATION_META: Record<
  RelationType,
  { label: string; variant: BadgeVariant }
> = {
  supports: { label: "뒷받침", variant: "info" },
  conflicts: { label: "충돌", variant: "error" },
  replaces: { label: "대체", variant: "warning" },
  duplicates: { label: "같음", variant: "neutral" },
  resolves: { label: "해소", variant: "success" },
};
