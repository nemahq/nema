import { useSyncExternalStore } from "react";

import { Text } from "@nema-io/weave";

import {
  formatCompactDistance,
  getMinuteTickSnapshot,
  isWithinLastMinute,
  type Lang,
  subscribeToMinuteTick,
} from "@web/components/ui/relativeTimeFormat";
import { useTranslation } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";

import { useReviewSaveStatusContext } from "./ReviewDraftProvider";

const STATUS_LABEL_KEY = {
  error: "review.save_status_error",
  conflict: "review.save_status_conflict",
} as const;

// 셋 다(clean·error·conflict) 정적 텍스트다 — clean→실패 전환 순간에 한해
// 토스트가 별도로 뜨므로(반복 실패는 안 띄움), 이 배지는 "지금 상태가 뭔지"만
// 보여주면 되고 서버가 준 구체적 원인(saveStatus.message)까지 클릭해서 다시
// 볼 수 있게 팝오버로 열어둘 필요가 없다.
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { saveStatus } = useReviewSaveStatusContext();
  // 분마다 다시 그려야 "3분 전" 같은 상대시각이 계속 최신으로 보인다.
  useSyncExternalStore(subscribeToMinuteTick, getMinuteTickSnapshot);

  const lang: Lang = tolgee.getLanguage() === "ko" ? "ko" : "en";

  if (saveStatus.kind === "clean") {
    // savedAt이 null이면 이번 세션에서 아직 저장한 적이 없다는 뜻 — 지어낼
    // 경과 시간이 없으니 "방금 저장됨" 문구로 둔다.
    const cleanLabel =
      saveStatus.savedAt === null || isWithinLastMinute(saveStatus.savedAt)
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
    <Text
      as="span"
      size="xs"
      weight="medium"
      color="error"
      className="shrink-0 rounded-full bg-status-error-tint px-2.5 py-1"
    >
      {t(STATUS_LABEL_KEY[saveStatus.kind])}
    </Text>
  );
}
