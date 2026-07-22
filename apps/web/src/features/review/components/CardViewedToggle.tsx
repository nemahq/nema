import { useId } from "react";

import { Checkbox, cn, Text } from "@nema-io/weave";

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
    <Text
      as="label"
      htmlFor={fieldId}
      size="xs"
      color={viewed ? "primary" : "tertiary"}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-2 py-1",
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
    </Text>
  );
}
