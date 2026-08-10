import { useId } from "react";

import { Checkbox, cn, Label } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface CardViewedToggleProps {
  viewed: boolean;
  disabled: boolean;
  onToggleViewed: () => void;
}

// 세 카드 헤더가 공유 — 짧고 닫힌 윤곽이라 border-strong(weave-usage.md 구분선
// 3단 위계)을 쓴다. checkbox-label 짝은 이 안에서만 쓰이는 구현 세부라 id도 여기서
// 만든다(호출부마다 "digest-3-viewed" 같은 문자열을 조립하게 두지 않는다). 라벨도
// 고정("읽음")한다 — 호출부마다 같은 문구를 넘기게 하면 번역 키가 불필요하게
// 갈라진다(실제로 digest_viewed_action/reference_viewed_action으로 갈라졌었음).
export function CardViewedToggle({
  viewed,
  disabled,
  onToggleViewed,
}: CardViewedToggleProps) {
  const { t } = useTranslation();
  const fieldId = useId();

  return (
    <Label
      htmlFor={fieldId}
      size="xs"
      color={viewed ? "primary" : "tertiary"}
      className={cn(
        // gap-1·transition-colors·hover 톤은 weave Button의 ghost variant
        // 레시피 그대로 — DigestSourceButton과 나란히 있는 자리라 값을
        // 새로 정하지 않고 그 컴포넌트가 이미 쓰는 값을 그대로 옮겨온다.
        // leading-4(16px)는 Text의 기본 xs 행간(1.4=16.8px) 대신 Button의
        // text-xs 행간과 맞춘 값 — 안 그러면 이 라벨(텍스트 포함)과
        // DigestSourceButton(아이콘만)의 행 높이가 미세하게 어긋난다.
        "flex cursor-pointer items-center gap-1 rounded-md border border-border-strong px-2 py-1 leading-4 transition-colors hover:bg-surface-raised-hover/75 dark:hover:bg-surface-raised-hover",
        viewed && "bg-fg-primary/10",
      )}
    >
      <Checkbox
        id={fieldId}
        disabled={disabled}
        checked={viewed}
        onCheckedChange={onToggleViewed}
      />
      {t("review.viewed_action")}
    </Label>
  );
}
