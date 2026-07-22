import { Checkbox, cn, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface CardViewedToggleProps {
  fieldId: string;
  viewed: boolean;
  disabled: boolean;
  onToggleViewed: () => void;
}

// DigestCardHeader·ReferenceCardHeader·ReferenceMergeCard가 공유 — 짧고 닫힌
// 윤곽이라 border-strong(weave-usage.md 구분선 3단 위계)을 쓴다. 라벨도 이 안에서
// 고정("읽음")한다 — 호출부마다 같은 문구를 넘기게 하면 번역 키가 불필요하게
// 갈라진다(실제로 digest_viewed_action/reference_viewed_action으로 갈라졌었음).
export function CardViewedToggle({
  fieldId,
  viewed,
  disabled,
  onToggleViewed,
}: CardViewedToggleProps) {
  const { t } = useTranslation();

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
