import type { DigestBodyFieldKind } from "@web/features/review/constants";
import { isSameFieldValue } from "@web/features/review/digestBodyFieldValue";
import { useRegisteredBufferedField } from "@web/features/review/hooks/useRegisteredBufferedField";

import { DigestListField } from "./DigestListField";
import { DigestTextField } from "./DigestTextField";

interface MergeDraftBodyFieldProps {
  kind: DigestBodyFieldKind;
  value: string | string[];
  disabled: boolean;
  placeholder: string;
  registerPendingCommit: (commit: () => void) => () => void;
  onCommit: (next: string | string[]) => void;
}

// MergeProposalCard 본문 필드 하나 — 타이핑을 이 컴포넌트 안에 가둬 두고
// (apps/web/CLAUDE.md "Typing MUST stay local to the field"), blur·pause
// 경계에서만 draft로 넘긴다. DigestBodyField와 달리 ReviewDraftContext가
// 없어 registry를 prop으로 직접 받는다.
export function MergeDraftBodyField({
  kind,
  value,
  disabled,
  placeholder,
  registerPendingCommit,
  onCommit,
}: MergeDraftBodyFieldProps) {
  const field = useRegisteredBufferedField(
    value,
    onCommit,
    registerPendingCommit,
    isSameFieldValue,
  );

  return kind === "text" ? (
    <DigestTextField
      text={typeof field.value === "string" ? field.value : ""}
      disabled={disabled}
      placeholder={placeholder}
      onChange={field.setValue}
      onBlur={field.commitNow}
    />
  ) : (
    <DigestListField
      items={Array.isArray(field.value) ? field.value : [field.value]}
      disabled={disabled}
      placeholder={placeholder}
      onChange={field.setValue}
      onBlur={field.commitNow}
    />
  );
}
