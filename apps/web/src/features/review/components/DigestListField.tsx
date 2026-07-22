import { useEffect, useRef, useState } from "react";

import { Circle } from "@nema-io/weave/icons";

import { InvisibleTextarea } from "./InvisibleTextarea";

interface DigestListFieldProps {
  items: string[];
  disabled: boolean;
  placeholder: string;
  onChange: (next: string[]) => void;
}

interface PendingFocus {
  index: number;
  cursor: number;
}

// 항목 추가·삭제 버튼을 두지 않고 리스트 에디터의 표준 동작만 쓴다 — Enter는 커서
// 위치에서 줄을 쪼개고, 맨 앞 Backspace는 앞 항목에 이어붙인다(Notion·Google Docs와
// 동일). 별도 액션을 배우지 않아도 이미 아는 습관 그대로 편집하게 된다.
export function DigestListField({
  items,
  disabled,
  placeholder,
  onChange,
}: DigestListFieldProps) {
  const itemRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  // 쪼개기·병합 직후엔 아직 렌더 전이라 ref가 없다 — 다음 렌더 후 effect에서 잡는다.
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  useEffect(
    function focusPendingItem() {
      const pending = pendingFocusRef.current;
      if (!pending) {
        return;
      }
      pendingFocusRef.current = null;
      const el = itemRefs.current[pending.index];
      el?.focus();
      el?.setSelectionRange(pending.cursor, pending.cursor);
    },
    [items],
  );

  function splitItem(itemIndex: number, cursor: number) {
    const next = [...items];
    next[itemIndex] = items[itemIndex].slice(0, cursor);
    next.splice(itemIndex + 1, 0, items[itemIndex].slice(cursor));
    pendingFocusRef.current = { index: itemIndex + 1, cursor: 0 };
    onChange(next);
  }

  function mergeIntoPrevious(itemIndex: number) {
    const previous = items[itemIndex - 1];
    const next = [...items];
    next[itemIndex - 1] = previous + items[itemIndex];
    next.splice(itemIndex, 1);
    pendingFocusRef.current = { index: itemIndex - 1, cursor: previous.length };
    onChange(next);
  }

  function handleKeyDown(
    itemIndex: number,
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    const input = e.currentTarget;
    if (e.key === "Enter") {
      e.preventDefault();
      splitItem(itemIndex, input.selectionStart ?? items[itemIndex].length);
      return;
    }
    // 맨 앞 커서에서만 병합한다 — 그 외 위치는 브라우저 기본 동작(한 글자 지우기)에
    // 맡긴다. 첫 항목이면 합칠 대상이 없어 아무것도 안 한다.
    if (
      e.key === "Backspace" &&
      itemIndex > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0
    ) {
      e.preventDefault();
      mergeIntoPrevious(itemIndex);
    }
  }

  return (
    <div className="flex flex-col gap-1 pl-2">
      {items.map((item, itemIndex) => (
        <div key={itemIndex} className="flex items-start gap-2">
          {/* 빈 줄에도 상시 노출 — 포커스된 줄의 placeholder가 "채울 수 있다"는
              신호를 이미 줘서, 불릿까지 숨기면 빈 줄이 렌더 깨진 것처럼 보인다.
              mt-2.5는 첫 줄 라인박스(26px) 안에서 6px 원이 중앙에 오는 값이라,
              항목이 여러 줄로 늘어나도 불릿은 첫 줄 기준선에 남는다. */}
          <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
          <InvisibleTextarea
            ref={(el) => {
              itemRefs.current[itemIndex] = el;
            }}
            value={item}
            disabled={disabled}
            placeholder={focusedIndex === itemIndex ? placeholder : undefined}
            onChange={(next) =>
              onChange(items.map((v, i) => (i === itemIndex ? next : v)))
            }
            onKeyDown={(e) => handleKeyDown(itemIndex, e)}
            onFocus={() => setFocusedIndex(itemIndex)}
            onBlur={() =>
              setFocusedIndex((current) =>
                current === itemIndex ? null : current,
              )
            }
          />
        </div>
      ))}
    </div>
  );
}
