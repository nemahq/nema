import { CountBadge, Tab } from "@nema-io/weave";

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
    <Tab active={active} onClick={onClick}>
      {children}
      {!!count && <CountBadge count={count} />}
    </Tab>
  );
}
