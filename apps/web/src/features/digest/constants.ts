import type { DigestType } from "@nema-io/shared";
import type { IconComponent } from "@nema-io/weave/icons";
import {
  Flag,
  FlaskConical,
  Hourglass,
  Lightbulb,
  Telescope,
} from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";

// legacy/apps/web/src/features/review/constants.ts DIGEST_TYPE_ICON과 동일 매핑 —
// 다이제스트 유형은 화면에 상관없이 같은 시각 언어를 쓴다. Check는 드롭다운
// 선택 표시로 이미 쓰이고 있어 제외했고, HelpCircle류(물음표)는 안내·도움말
// 아이콘으로 통용돼 헷갈릴 여지가 있어 pending에는 안 썼다.
export const DIGEST_TYPE_ICON: Record<DigestType, IconComponent> = {
  decision: Flag,
  pending: Hourglass,
  learning: Telescope,
  idea: Lightbulb,
  assumption: FlaskConical,
};

export const DIGEST_TYPE_LABEL_KEY: Record<DigestType, TranslationKey> = {
  decision: "digest.type_decision",
  pending: "digest.type_pending",
  learning: "digest.type_learning",
  idea: "digest.type_idea",
  assumption: "digest.type_assumption",
};
