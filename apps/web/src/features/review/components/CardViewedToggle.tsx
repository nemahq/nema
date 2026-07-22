import { Checkbox, cn, Text } from "@nema-io/weave";

interface CardViewedToggleProps {
  fieldId: string;
  label: string;
  viewed: boolean;
  disabled: boolean;
  onToggleViewed: () => void;
}

// DigestCardHeader·ReferenceCardHeader가 공유 — 짧고 닫힌 윤곽이라
// border-strong(weave-usage.md 구분선 3단 위계)을 쓴다. 각자 복사해두면 한쪽만
// 토큰이 바뀌었을 때 드리프트가 생기므로(실제로 한 번 벌어졌음) 여기 하나로 둔다.
export function CardViewedToggle({
  fieldId,
  label,
  viewed,
  disabled,
  onToggleViewed,
}: CardViewedToggleProps) {
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
      {label}
    </Text>
  );
}
