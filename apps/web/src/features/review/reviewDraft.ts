import {
  DIGEST_BODY_FIELDS,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import type {
  DigestReviewDetail,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

// digestReview.get 응답 그 자체가 편집 대상이다 — 서버 원본과 사람 편집분을 따로
// 두지 않는다. "지금 초안이 뭔 모습인가"가 항상 이 값 하나로 가리켜지므로, 저장은
// 이 값을 통째로 보내면 되고 실행취소는 이 값을 이전 모습으로 되돌리면 된다.
export type ReviewDraft = DigestReviewDetail;

// 편집 경로를 액션 하나로 모으는 이유는 review-flow.md의 실행취소·다시 실행 —
// 액션 로그만 쌓으면 되게 하려는 것이다. 흩어진 setState로는 "가장 최근 액션"을
// 표현할 수 없다.
export type ReviewDraftAction =
  | { type: "digest/setTitle"; id: string; title: string }
  | { type: "digest/setDescription"; id: string; description: string }
  | { type: "digest/setBody"; id: string; body: ReviewDigest["body"] }
  // 본문 필드 하나만 고치는 경로 — 초안이 이미 현재 body를 들고 있어 호출부가
  // 합칠 바탕을 같이 넘길 필요가 없다.
  | {
      type: "digest/setBodyField";
      id: string;
      key: DigestBodyFieldKey;
      value: string | string[];
    }
  | { type: "digest/setTopics"; id: string; topics: ReviewDigest["topics"] }
  | { type: "digest/setTags"; id: string; tags: ReviewDigest["tags"] }
  | { type: "digest/remove"; id: string }
  // 액션 판별자가 type을 이미 쓰고 있어 Reference 유형은 다른 이름으로 받는다.
  | {
      type: "reference/setType";
      id: string;
      referenceType: ReviewNewReference["type"];
    }
  | { type: "reference/setTitle"; id: string; title: string }
  | { type: "reference/setBody"; id: string; body: string }
  | { type: "reference/remove"; id: string }
  | { type: "citedReference/setMergeNote"; id: string; mergeNote: string };

// 손대지 않은 항목은 참조를 그대로 돌려준다 — 카드가 초안에서 받은 객체의 동일성이
// 유지돼야, 한 카드를 고쳐도 형제 카드의 props가 안 바뀐다.
function patchDigest(
  draft: ReviewDraft,
  id: string,
  patch: Partial<ReviewDigest>,
): ReviewDraft {
  return {
    ...draft,
    digests: draft.digests.map((digest) =>
      digest.id === id ? { ...digest, ...patch } : digest,
    ),
  };
}

function patchNewReference(
  draft: ReviewDraft,
  id: string,
  patch: Partial<ReviewNewReference>,
): ReviewDraft {
  return {
    ...draft,
    newReferences: draft.newReferences.map((reference) =>
      reference.id === id ? { ...reference, ...patch } : reference,
    ),
  };
}

export function reviewDraftReducer(
  draft: ReviewDraft,
  action: ReviewDraftAction,
): ReviewDraft {
  switch (action.type) {
    case "digest/setTitle":
      return patchDigest(draft, action.id, { title: action.title });
    case "digest/setDescription":
      return patchDigest(draft, action.id, {
        description: action.description,
      });
    case "digest/setBody":
      return patchDigest(draft, action.id, { body: action.body });
    case "digest/setBodyField": {
      const digest = draft.digests.find(
        (candidate) => candidate.id === action.id,
      );
      if (!digest) {
        return draft;
      }
      // key는 DigestBodyFieldKey(모든 타입의 필드를 합친 union)라 현재 body.type과
      // 무관한 값도 타입 체크를 통과한다 — 실제로 섞이면 서버 zod가 조용히
      // 스트립하지만, 그 전에 여기서 막아 초안 자체를 오염시키지 않는다.
      const isValidForCurrentType = DIGEST_BODY_FIELDS[digest.body.type].some(
        (field) => field.key === action.key,
      );
      if (!isValidForCurrentType) {
        return draft;
      }
      return patchDigest(draft, action.id, {
        body: { ...digest.body, [action.key]: action.value },
      });
    }
    case "digest/setTopics":
      return patchDigest(draft, action.id, { topics: action.topics });
    case "digest/setTags":
      return patchDigest(draft, action.id, { tags: action.tags });
    case "digest/remove":
      return {
        ...draft,
        digests: draft.digests.filter((digest) => digest.id !== action.id),
      };
    case "reference/setType":
      return patchNewReference(draft, action.id, {
        type: action.referenceType,
      });
    case "reference/setTitle":
      return patchNewReference(draft, action.id, { title: action.title });
    case "reference/setBody":
      return patchNewReference(draft, action.id, { body: action.body });
    case "reference/remove":
      // 이 화면엔 digest 본문에서 인용 하나만 콕 집어 떼는 UI가 없다(엔진이 추출
      // 시점에 붙인 것이라 사람이 만든 게 아님) — 그래서 신규 Reference 후보를
      // 지우는 것 자체를 "이 인용도 없던 걸로"라는 의도로 본다. 안 떼면 저장 시
      // 서버가 존재하지 않는 인용이라며 원문 zod 에러로 거절한다.
      return {
        ...draft,
        newReferences: draft.newReferences.filter(
          (reference) => reference.id !== action.id,
        ),
        digests: draft.digests.map((digest) =>
          digest.newReferenceKeys.includes(action.id)
            ? {
                ...digest,
                newReferenceKeys: digest.newReferenceKeys.filter(
                  (key) => key !== action.id,
                ),
              }
            : digest,
        ),
      };
    case "citedReference/setMergeNote":
      return {
        ...draft,
        citedReferences: draft.citedReferences.map((reference) =>
          reference.id === action.id
            ? { ...reference, mergeNote: action.mergeNote }
            : reference,
        ),
      };
  }
}
