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
  // "이전 실행은 건너뛴다"는 소비형 플래그 대신 이전 타입 값을 들고 비교한다 —
  // 소비형 플래그(한 번 쓰면 꺼짐)는 StrictMode가 마운트 시 effect를 두 번
  // 돌리면 두 번째 호출에서 이미 꺼진 채로 남아 페이지 진입만 해도 포커스가
  // 뺏기는 문제가 있었다. 값 비교는 몇 번을 다시 불러도 매번 같은 결과라
  // 안전하다.
  const prevTypeRef = useRef(body.type);

  useEffect(
    function focusFirstFieldOnTypeChange() {
      if (prevTypeRef.current === body.type) {
        return;
      }
      prevTypeRef.current = body.type;
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
