import { Badge, cn } from "@nema-io/weave";

interface SpaceTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
  // 검토 대기 등 "놓치면 안 되는" 개수만 넘긴다 — 탭을 안 열어도 눈에 띄어야 해서
  // 라벨 옆 괄호 텍스트 대신 별도 Badge로 렌더한다.
  count?: number;
}

export function SpaceTabButton({
  active,
  onClick,
  children,
  count,
}: SpaceTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors duration-fast",
        active
          ? "border-fg-primary font-bold text-fg-primary"
          : "border-transparent text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
      {!!count && (
        <Badge
          variant="success"
          className="rounded-full px-2 py-0.5 text-xs leading-none"
        >
          {count}
        </Badge>
      )}
    </button>
  );
}
