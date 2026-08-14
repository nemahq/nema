interface DetailConnectorIconProps {
  className?: string;
}

// "이 줄은 위 선택지에 딸린 부연"임을 가리키는 커스텀 훅 모양 — 세로선이
// 살짝 굴곡지며 오른쪽으로 꺾인다. lucide CornerDownRight에서 화살촉만 뺀
// 형태 — 방향을 가리키는 화살표가 아니라 소속을 나타내는 연결선이라
// 화살촉은 필요 없다.
export function DetailConnectorIcon({ className }: DetailConnectorIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 2v12a3 3 0 0 0 3 3h8" />
    </svg>
  );
}
