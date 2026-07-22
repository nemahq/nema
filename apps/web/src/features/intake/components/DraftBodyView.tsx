interface DraftBodyViewProps {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  maxLength?: number;
  ariaInvalid?: boolean;
  placeholder?: string;
}

// Idle(편집 가능)·Working(읽기 전용) 상세 패널이 공유하는 본문 표시 — 순수
// textarea라 개행(단일·이중 다)을 커스텀 처리 없이 그대로 보존한다. Working이
// 예전에 쓰던 문단 split+<p> 렌더링은 단일 개행이 사라지는 버그가 있었다.
export function DraftBodyView({
  value,
  onChange,
  onBlur,
  readOnly = false,
  maxLength,
  ariaInvalid,
  placeholder,
}: DraftBodyViewProps) {
  return (
    <textarea
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onBlur={onBlur}
      readOnly={readOnly}
      maxLength={maxLength}
      aria-invalid={ariaInvalid}
      placeholder={placeholder}
      className="flex-1 resize-none text-sm leading-relaxed text-fg-primary outline-none"
    />
  );
}
