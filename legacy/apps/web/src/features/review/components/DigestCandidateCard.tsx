import { useState } from "react";

import type { ReviewDraft } from "@web/features/review/reviewDraft";
import type { ReviewDigest } from "@web/features/review/types";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestBodyFields } from "./DigestBodyFields";
import { DigestCardHeader } from "./DigestCardHeader";
import { DigestDescriptionField } from "./DigestDescriptionField";
import { DigestTagPicker } from "./DigestTagPicker";
import { DigestTitleField } from "./DigestTitleField";
import { useReviewDraftContext } from "./ReviewDraftProvider";

interface DigestCandidateCardProps {
  digest: ReviewDigest;
  labelDraft: ReviewDraft["labelDraft"];
  disabled: boolean;
  sourceActive: boolean;
  onViewSource: () => void;
}

export function DigestCandidateCard({
  digest,
  labelDraft,
  disabled,
  sourceActive,
  onViewSource,
}: DigestCandidateCardProps) {
  // 읽음·포커스 모두 이 리뷰 세션 동안만 쓰는 화면 상태라 서버로도, 부모로도
  // 올리지 않는다 — 부모가 들면 카드 하나를 접을 때마다 목록 전체가 다시 그려진다.
  const [viewed, setViewed] = useState(false);
  const [focused, setFocused] = useState(false);
  const { dispatch } = useReviewDraftContext();

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
    <CandidateCardFrame
      viewed={viewed}
      onFocus={handleFieldFocus}
      onBlur={handleCardBlur}
      wash={
        /* Topic·제목·description을 한 워시 구역에 묶는다 — 셋이 나중에 피드
           미리보기 카드에 그대로 나갈 것들이라, "조작 가능한가"보다 이 묶음이
           더 안정적인 기준이라고 봤다(design-decisions-log.md). */
        <>
          <DigestCardHeader
            digestId={digest.id}
            type={digest.body.type}
            topicIds={digest.topics}
            topicPalette={labelDraft.topics}
            disabled={disabled}
            viewed={viewed}
            sourceActive={sourceActive}
            onToggleViewed={() => setViewed((current) => !current)}
            onViewSource={onViewSource}
            onChangeType={(next) =>
              dispatch({
                type: "digest/setBody",
                id: digest.id,
                body: { type: next },
              })
            }
            onRemove={() => dispatch({ type: "digest/remove", id: digest.id })}
          />
          <DigestTitleField
            digestId={digest.id}
            title={digest.title}
            disabled={disabled}
          />
          <DigestDescriptionField
            digestId={digest.id}
            description={digest.description}
            disabled={disabled}
          />
        </>
      }
    >
      <DigestBodyFields
        digestId={digest.id}
        body={digest.body}
        disabled={disabled}
        cardFocused={focused}
      />
      {/* 태그도 검색·분류용 메타라 카드를 이해하는 데 필수가 아니므로 본문과 같이
          접힌다(타입과 달리 접힘 상태에서 따로 되살리지 않는다).
          pl-2를 여기 안 두는 이유 — DigestTagPicker 트리거 자신이 본문 필드와 같은
          값(px-2)의 패딩을 이미 갖고 있어, 여기서 또 주면 이중으로 밀린다. mt-3만
          둬서 필드 사이 간격(gap-3)과 같은 무게로 리듬만 유지한다. */}
      <div className="mt-3">
        <DigestTagPicker
          digestId={digest.id}
          tagIds={digest.tags}
          tagPalette={labelDraft.tags}
          disabled={disabled}
        />
      </div>
    </CandidateCardFrame>
  );
}
