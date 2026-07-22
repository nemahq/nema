import { useState } from "react";

import { cn } from "@nema-io/weave";

import type { ReviewDigest } from "@web/features/review/types";

import { DigestBodyFields } from "./DigestBodyFields";
import { DigestCardHeader } from "./DigestCardHeader";
import { DigestDescriptionField } from "./DigestDescriptionField";
import { DigestTitleField } from "./DigestTitleField";
import { useEditing } from "./EditingProvider";

interface DigestCandidateCardProps {
  digestIndex: number;
  digest: ReviewDigest;
  disabled: boolean;
  sourceActive: boolean;
  onViewSource: () => void;
}

// 후보 하나는 독립된 메모지 폼이 아니라는 게 이 카드의 전제다 — 4방향 테두리 대신
// 헤더에만 옅은 워시를 깔아 "여기부터 새 카드"만 알리고, 본문은 배경 없이 그대로
// 둔다(design-decisions-log.md).
export function DigestCandidateCard({
  digestIndex,
  digest,
  disabled,
  sourceActive,
  onViewSource,
}: DigestCandidateCardProps) {
  // 읽음·포커스 모두 이 리뷰 세션 동안만 쓰는 화면 상태라 서버로도, 부모로도
  // 올리지 않는다 — 부모가 들면 카드 하나를 접을 때마다 목록 전체가 다시 그려진다.
  const [viewed, setViewed] = useState(false);
  const [focused, setFocused] = useState(false);
  const dispatch = useEditing((state) => state.dispatch);
  const type = useEditing(
    (state) =>
      (state.overrides.bodyOverrides.get(digestIndex) ?? digest.body).type,
  );

  // 실제 편집 필드에 포커스가 들어올 때만 펼친다. ⋯ 메뉴처럼 Portal로 렌더되는
  // 요소도 합성 이벤트는 여기까지 버블링되는데, data-nav-field가 안 붙어 있어
  // 액션마다 예외를 추가하지 않아도 걸러진다.
  function handleFieldFocus(e: React.FocusEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest("[data-nav-field]")) {
      setFocused(true);
    }
  }

  // 같은 카드 안 다른 필드로 옮겨가는 중간엔 접히면 안 되므로 onBlur만으론
  // 부족하다 — 포커스가 카드를 완전히 벗어났는지 relatedTarget으로 본다.
  function handleCardBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setFocused(false);
    }
  }

  return (
    <div
      onFocus={handleFieldFocus}
      onBlur={handleCardBlur}
      className={cn(
        "flex flex-col gap-2",
        // 접힌 카드는 3줄로 짧아져서 같은 여백이면 헐거워 보인다 — 뒤쪽이 더
        // 촘촘한 피드 리듬이 되도록 좁힌다.
        viewed ? "pb-4" : "pb-8",
      )}
    >
      {/* 각진 모서리 — 둥근 모서리는 이 앱에서 클릭 가능한 컨트롤의 시각 언어라,
          여기 쓰면 헤더가 영역 표시가 아니라 또 하나의 컨트롤처럼 보인다. */}
      <div className="flex flex-col gap-2 bg-fg-primary/5 px-2 py-2">
        <DigestCardHeader
          digestIndex={digestIndex}
          type={type}
          baseTopics={digest.topics}
          disabled={disabled}
          viewed={viewed}
          sourceActive={sourceActive}
          onToggleViewed={() => setViewed((current) => !current)}
          onViewSource={onViewSource}
          onChangeType={(next) =>
            dispatch({
              type: "digest/setBody",
              index: digestIndex,
              body: { type: next },
            })
          }
          onRemove={() =>
            dispatch({ type: "digest/remove", index: digestIndex })
          }
        />
        {/* Topic·제목·description을 한 워시 구역에 묶는다 — 셋이 나중에 피드
            미리보기 카드에 그대로 나갈 것들이라, "조작 가능한가"보다 이 묶음이
            더 안정적인 기준이라고 봤다(design-decisions-log.md). */}
        <DigestTitleField
          digestIndex={digestIndex}
          baseTitle={digest.title}
          disabled={disabled}
        />
        <DigestDescriptionField
          digestIndex={digestIndex}
          baseDescription={digest.description}
          disabled={disabled}
        />
      </div>

      {/* 읽음 처리되면 본문을 통째로 안 그린다 — 헤더만 남아 피드 행처럼 접힌다. */}
      {!viewed && (
        <DigestBodyFields
          digestIndex={digestIndex}
          type={type}
          baseBody={digest.body}
          disabled={disabled}
          cardFocused={focused}
        />
      )}
    </div>
  );
}
