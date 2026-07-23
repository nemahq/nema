interface LabelTextInputProps {
  value: string;
  autoFocus?: boolean;
  maxLength?: number;
  // 이름·설명처럼 같은 모양의 필드가 한 팝오버 안에 여러 개 나란히 있을 수 있어
  // 시각 라벨 없이도 스크린리더가 구분할 수 있어야 한다 — 필수로 받는다. Chip의
  // removeAriaLabel과 같은 이유로 카멜케이스 — 컴포넌트 prop 네이밍은 그대로 두고,
  // 실제 DOM aria-label 매핑은 렌더 시점에서만 한다.
  ariaLabel: string;
  onChange: (value: string) => void;
  // 버튼이 없어 바깥 클릭 말고 키보드로도 끝낼 방법이 있어야 한다.
  onSubmit: () => void;
}

// weave Input 대신 raw — h-9 고정 높이가 이 좁은 패널엔 과하다. 테두리는 살려서
// "이건 입력 필드다"가 보이게 한다 — 메뉴처럼 라벨·버튼은 없앴지만, 값 자체는
// 팝오버 배경과 구분돼야 한다.
export function LabelTextInput({
  value,
  autoFocus,
  maxLength,
  ariaLabel,
  onChange,
  onSubmit,
}: LabelTextInputProps) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onSubmit();
        }
      }}
      className="w-full min-w-0 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-fg-primary outline-none focus-visible:border-brand dark:focus-visible:border-fg-tertiary/70"
    />
  );
}
