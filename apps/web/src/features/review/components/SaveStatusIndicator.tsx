import { useSyncExternalStore } from "react";

import { cn, PopoverContent, PopoverTrigger, Text } from "@nema-io/weave";

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

// 저장마다 문구가 바뀌면(예: "저장 중…") 디바운스로 조용히 도는 자동 저장의 취지가
// 흐려진다 — clean 상태는 마지막 저장 시각을 압축 상대시각("3분 전")으로만 조용히
// 갱신하고, 실패했을 때만 눈에 띄게 바뀐다. 클릭하면 상태에 맞는 설명(정상일 땐 안내
// 문구, 실패·충돌일 땐 서버가 알려준 원인)이 펼쳐진다 — diff 비교·복원 같은 실제
// 조작은 이번 스코프 밖이라 지금은 그 설명까지만 보여주는 스텁이다.
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { saveStatus } = useReviewSaveStatusContext();
  // 분마다 다시 그려야 "3분 전" 같은 상대시각이 계속 최신으로 보인다.
  useSyncExternalStore(subscribeToMinuteTick, getMinuteTickSnapshot);
  const isFailure = saveStatus.kind !== "clean";

  const lang: Lang = tolgee.getLanguage() === "ko" ? "ko" : "en";
  let cleanLabel: string | null = null;
  if (saveStatus.kind === "clean") {
    cleanLabel = isWithinLastMinute(saveStatus.savedAt)
      ? t("review.save_status_saved_now")
      : t("review.save_status_saved_ago", {
          time: formatCompactDistance(saveStatus.savedAt, lang),
        });
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
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors data-[state=open]:bg-fg-primary/5",
            isFailure
              ? "bg-status-error-tint text-status-error"
              : "text-fg-tertiary hover:bg-fg-primary/5",
          )}
        >
          {saveStatus.kind === "clean"
            ? cleanLabel
            : t(STATUS_LABEL_KEY[saveStatus.kind])}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <Text as="p" size="sm" color={isFailure ? "error" : "secondary"}>
          {saveStatus.kind === "clean"
            ? t("review.save_status_saved_description")
            : saveStatus.message}
        </Text>
      </PopoverContent>
    </Popover>
  );
}
