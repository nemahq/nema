import { useEffect, useRef } from "react";

import { DIGEST_BODY_FIELDS } from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";

import { DigestBodyField } from "./DigestBodyField";

interface DigestBodyFieldsProps {
  digestId: string;
  body: ReviewDigest["body"];
  disabled: boolean;
  cardFocused: boolean;
}

// 타입별 필드를 항상 전부 그린다 — 원문에 없어 비어 있는 필드도 자리를 지키고
// 클릭하면 바로 채울 수 있어야 "AI가 놓친 걸 사람이 채운다"는 교정 경로가
// 생긴다(design-decisions-log.md).
export function DigestBodyFields({
  digestId,
  body,
  disabled,
  cardFocused,
}: DigestBodyFieldsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 마운트 시점의 첫 실행은 건너뛴다 — 타입이 바뀐 게 아니라 카드가 막 나타난
  // 것뿐이라 그때까지 포커스를 뺏으면 안 된다.
  const skipNextRef = useRef(true);

  useEffect(
    function focusFirstFieldOnTypeChange() {
      if (skipNextRef.current) {
        skipNextRef.current = false;
        return;
      }
      containerRef.current
        ?.querySelector<HTMLTextAreaElement>("[data-nav-field]")
        ?.focus();
    },
    [body.type],
  );

  return (
    <div ref={containerRef} className="mt-2 flex flex-col gap-3 pl-2">
      {DIGEST_BODY_FIELDS[body.type].map((field) => (
        <DigestBodyField
          key={field.key}
          digestId={digestId}
          body={body}
          fieldKey={field.key}
          kind={field.kind}
          labelKey={field.labelKey}
          placeholderKey={field.placeholderKey}
          disabled={disabled}
          cardFocused={cardFocused}
        />
      ))}
    </div>
  );
}
