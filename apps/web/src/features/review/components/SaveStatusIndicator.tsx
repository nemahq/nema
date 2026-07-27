import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

import { useReviewSaveStatusContext } from "./ReviewDraftProvider";

const STATUS_LABEL_KEY = {
  clean: "review.save_status_saved",
  error: "review.save_status_error",
  conflict: "review.save_status_conflict",
} as const;

// 저장마다 문구가 바뀌면(예: "저장 중…") 디바운스로 조용히 도는 자동 저장의 취지가
// 흐려진다 — clean 상태는 항상 같은 정적 문구를 보여주고, 실패했을 때만 눈에 띄게
// 바뀐다. 클릭하면 상태 설명이 펼쳐지지만 diff·복원 같은 실제 조작은 이번 스코프
// 밖이라 지금은 같은 문구를 다시 보여주는 스텁이다.
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { saveStatus } = useReviewSaveStatusContext();
  const isFailure = saveStatus.kind !== "clean";

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Badge는 클릭 트리거를 못 감당하고 Button은 자체 타이포(font-semibold
            13px)를 강제해 상태 pill 톤을 되돌리는 비용이 더 크다 — weave-usage.md
            "Button 안 쓴다" 사례와 같은 결이라 raw button을 쓴다. Popover/DropdownMenu
            트리거가 아닌 raw 태그라 열림 표시(data-[state=open])도 직접 단다. */}
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors data-[state=open]:bg-fg-primary/5",
            isFailure
              ? "bg-status-error-tint text-status-error"
              : "text-fg-tertiary hover:bg-fg-primary/5",
          )}
        >
          {t(STATUS_LABEL_KEY[saveStatus.kind])}
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
