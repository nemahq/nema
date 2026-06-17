import { type ComponentProps, useState } from "react";

import { Button } from "@nema-io/weave";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  onConfirm: () => void;
}

// 되돌리기 어려운 조작(빼기·되돌리기)의 오클릭 방지 — 첫 클릭은 무장만, 두 번째에 실행.
export function ConfirmButton({
  label,
  confirmLabel = "확실?",
  variant = "ghost",
  disabled,
  onConfirm,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        size="xs"
        variant={variant}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        size="xs"
        variant="danger"
        disabled={disabled}
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setArmed(false)}>
        취소
      </Button>
    </span>
  );
}
