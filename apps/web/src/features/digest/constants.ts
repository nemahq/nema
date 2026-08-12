import type { DigestType } from "@nema-io/shared";

import type { TranslationKey } from "@web/lib/tolgee";

export const DIGEST_TYPE_LABEL_KEY: Record<DigestType, TranslationKey> = {
  decision: "digest.type_decision",
  pending: "digest.type_pending",
  learning: "digest.type_learning",
  idea: "digest.type_idea",
  assumption: "digest.type_assumption",
};
