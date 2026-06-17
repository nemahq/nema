import { type BadgeVariant } from "@nema-io/weave";

import type { RelationType } from "@web/features/dev-harness/types";

export const RELATION_META: Record<
  RelationType,
  { label: string; variant: BadgeVariant }
> = {
  supports: { label: "뒷받침", variant: "info" },
  conflicts: { label: "충돌", variant: "error" },
  replaces: { label: "대체", variant: "warning" },
  resolves: { label: "해소", variant: "success" },
};
