interface LabelTextInputProps {
  value: string;
  autoFocus?: boolean;
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
  onChange,
  onSubmit,
}: LabelTextInputProps) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
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
