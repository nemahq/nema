import { useSyncExternalStore } from "react";

import { PopoverContent, PopoverTrigger, Text } from "@nema-io/weave";

import { Popover } from "@web/components/ui/Popover";
import {
  getMinuteTickSnapshot,
  subscribeToMinuteTick,
} from "@web/components/ui/RelativeTime";
import {
  formatCompactDistance,
  isWithinLastMinute,
  type Lang,
} from "@web/components/ui/relativeTimeFormat";
import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import { useReviewSaveStatusContext } from "./ReviewDraftProvider";

const STATUS_LABEL_KEY = {
  error: "review.save_status_error",
  conflict: "review.save_status_conflict",
} as const;

// clean 상태는 클릭해도 볼 정보가 없어(고정 안내 문구뿐) 정적 텍스트로 둔다 —
// 마지막 저장 시각만 압축 상대시각("3분 전")으로 조용히 갱신된다. 실패·충돌은
// 서버가 알려준 구체적 원인이 클릭 전엔 안 보이는 정보라 계속 클릭 가능한
// 배지로 남긴다 — 이 mutation은 skipGlobalToast라 전역 토스트를 안 쓰고(반복
// 실패 시 Infinity-duration 토스트가 쌓이는 걸 피하려는 의도, useUpdateReview.ts
// 참고) 이 배지가 유일한 실패 노출 경로다.
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { saveStatus } = useReviewSaveStatusContext();
  // 분마다 다시 그려야 "3분 전" 같은 상대시각이 계속 최신으로 보인다.
  useSyncExternalStore(subscribeToMinuteTick, getMinuteTickSnapshot);

  const lang: Lang = tolgee.getLanguage() === "ko" ? "ko" : "en";

  if (saveStatus.kind === "clean") {
    const cleanLabel = isWithinLastMinute(saveStatus.savedAt)
      ? t("review.save_status_saved_now")
      : t("review.save_status_saved_ago", {
          time: formatCompactDistance(saveStatus.savedAt, lang),
        });
    return (
      <Text
        as="span"
        size="xs"
        weight="medium"
        color="tertiary"
        className="shrink-0 rounded-full px-2.5 py-1"
      >
        {cleanLabel}
      </Text>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Badge는 클릭 트리거를 못 감당하고 Button은 자체 타이포(font-semibold
            13px)를 강제해 상태 pill 톤을 되돌리는 비용이 더 크다 — weave-usage.md
            "Button 안 쓴다" 사례와 같은 결이라 raw button을 쓴다. Chip도 검토했지만
            NEUTRAL_TONE_CLASSNAME/OUTLINE_TONE_CLASSNAME만 노출해 실패 톤
            (bg-status-error-tint text-status-error, Badge에는 있는 error 톤)을
            표현할 수 없다. Popover/DropdownMenu 트리거가 아닌 raw 태그라 열림
            표시(data-[state=open])도 직접 단다. */}
        <button
          type="button"
          className="shrink-0 rounded-full bg-status-error-tint px-2.5 py-1 text-xs font-medium text-status-error transition-colors data-[state=open]:bg-fg-primary/5"
        >
          {t(STATUS_LABEL_KEY[saveStatus.kind])}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <Text as="p" size="sm" color="error">
          {saveStatus.message}
        </Text>
      </PopoverContent>
    </Popover>
  );
}
