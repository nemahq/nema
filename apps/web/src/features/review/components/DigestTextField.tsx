import { useState } from "react";

import { InvisibleTextarea } from "./InvisibleTextarea";

interface DigestTextFieldProps {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (next: string) => void;
}

// 포커스된 필드에만 placeholder를 보여준다 — 카드를 훑을 때 빈 필드마다 질문형
// 문구가 떠 있으면 읽을 텍스트가 실제 내용보다 많아진다.
export function DigestTextField({
  value,
  disabled,
  placeholder,
  onChange,
}: DigestTextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <InvisibleTextarea
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={isFocused ? placeholder : undefined}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  );
}
