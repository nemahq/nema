import { cn, Text } from "@nema-io/weave";

interface SpaceBadgeProps {
  name: string;
  size?: "sm" | "md";
}

// SpaceOverview의 내비게이션 바(sm)·콘텐츠 헤더(md), Changeset 상세 breadcrumb이
// 공유하는 Space 이니셜 배지 — 크기만 다르고 톤(중립색·rounded-md)은 항상 같다.
export function SpaceBadge({ name, size = "md" }: SpaceBadgeProps) {
  return (
    <Text
      as="span"
      size={size === "sm" ? "xs" : "sm"}
      bold
      color="primary"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-fg-primary/10",
        size === "sm" ? "size-6" : "size-8",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </Text>
  );
}
