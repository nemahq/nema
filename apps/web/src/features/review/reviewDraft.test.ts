import { describe, expect, it } from "vitest";

import {
  type ReviewDraft,
  type ReviewDraftAction,
  reviewDraftReducer,
} from "@web/features/review/reviewDraft";
import type {
  ReviewCitedReference,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";

const DIGEST: ReviewDigest = {
  id: "digest-1",
  position: 0,
  title: "제목",
  description: "요약",
  body: { type: "decision", situation: "원래 상황", choice: "원래 선택" },
  topics: [{ id: "topic-draft-1", registryId: null, title: "주제" }],
  tags: [
    { id: "tag-draft-1", registryId: null, title: "태그", description: "설명" },
  ],
  referenceIds: [],
  newReferenceKeys: [],
  externalUrls: [],
};

const DIGEST_2: ReviewDigest = { ...DIGEST, id: "digest-2", position: 1 };

const NEW_REFERENCE: ReviewNewReference = {
  id: "ref-1",
  position: 0,
  type: "person",
  title: "인물",
  body: "설명",
  externalUrls: [],
};

const CITED_REFERENCE: ReviewCitedReference = {
  id: "cited-1",
  type: "organization",
  title: "조직",
  body: "원본 설명",
  mergeNote: "다듬은 설명",
};

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    changesetId: "changeset-1",
    changesetNumber: 1,
    spaceId: "space-1",
    sourceId: "source-1",
    sourceTitle: "원문 제목",
    sourceBody: "원문 본문",
    sourceCreatedAt: "2026-07-18T00:00:00.000Z",
    draftVersion: 1,
    digests: [DIGEST, DIGEST_2],
    newReferences: [NEW_REFERENCE],
    citedReferences: [CITED_REFERENCE],
    ...overrides,
  };
}

// 액션마다 "어느 항목의 어느 필드를 바꾸는지"를 픽스처에 박아둔다 — 필드가 같은
// 모양으로 여럿이라 topics에 쓸 것을 tags에 쓰는 복붙 실수가 가장 나기 쉽고,
// 결과 초안이 바뀌었는지만 보면 그 실수가 그대로 통과한다.
const DIGEST_FIELD_ACTIONS: {
  action: ReviewDraftAction;
  field: keyof ReviewDigest;
  expected: unknown;
}[] = [
  {
    action: { type: "digest/setTitle", id: "digest-1", title: "새 제목" },
    field: "title",
    expected: "새 제목",
  },
  {
    action: {
      type: "digest/setDescription",
      id: "digest-1",
      description: "새 설명",
    },
    field: "description",
    expected: "새 설명",
  },
  {
    action: {
      type: "digest/setBody",
      id: "digest-1",
      body: { type: "learning" },
    },
    field: "body",
    expected: { type: "learning" },
  },
  {
    action: {
      type: "digest/setTopics",
      id: "digest-1",
      topics: [{ id: "topic-draft-2", registryId: null, title: "새 주제" }],
    },
    field: "topics",
    expected: [{ id: "topic-draft-2", registryId: null, title: "새 주제" }],
  },
  {
    action: {
      type: "digest/setTags",
      id: "digest-1",
      tags: [
        {
          id: "tag-draft-2",
          registryId: null,
          title: "새 태그",
          description: "설명",
        },
      ],
    },
    field: "tags",
    expected: [
      {
        id: "tag-draft-2",
        registryId: null,
        title: "새 태그",
        description: "설명",
      },
    ],
  },
];

describe("reviewDraftReducer — Digest 필드 수정", () => {
  it.each(DIGEST_FIELD_ACTIONS)(
    "$action.type은 대상 Digest의 $field만 바꾼다",
    ({ action, field, expected }) => {
      const next = reviewDraftReducer(draft(), action);

      const target = next.digests[0];
      expect(target[field]).toEqual(expected);
      expect({ ...target, [field]: DIGEST[field] }).toEqual(DIGEST);
    },
  );

  // 카드가 초안에서 받는 객체 prop의 동일성이 안정적이라는 게 이 구조의 전제다
  // (apps/web/docs/conventions.md의 객체 prop 규칙) — 매 편집마다 손대지 않은
  // 항목까지 새 객체로 다시 만들면 그 전제가 조용히 무너진다.
  it.each(DIGEST_FIELD_ACTIONS)(
    "$action.type은 다른 Digest의 참조를 그대로 둔다",
    ({ action }) => {
      const before = draft();

      const next = reviewDraftReducer(before, action);

      expect(next.digests[1]).toBe(before.digests[1]);
      expect(next.newReferences).toBe(before.newReferences);
      expect(next.citedReferences).toBe(before.citedReferences);
    },
  );

  it.each(DIGEST_FIELD_ACTIONS)(
    "$action.type은 이전 초안을 변형하지 않는다",
    ({ action }) => {
      const before = draft();

      reviewDraftReducer(before, action);

      expect(before).toEqual(draft());
    },
  );
});

describe("reviewDraftReducer — digest/setBodyField", () => {
  it("현재 body 위에 얹어 다른 필드의 앞선 수정이 남는다", () => {
    const next = reviewDraftReducer(draft(), {
      type: "digest/setBodyField",
      id: "digest-1",
      key: "choice",
      value: "고친 선택",
    });

    expect(next.digests[0].body).toEqual({
      type: "decision",
      situation: "원래 상황",
      choice: "고친 선택",
    });
  });

  it("현재 타입에 없는 필드 키는 무시하고 초안을 그대로 둔다", () => {
    const before = draft({
      digests: [{ ...DIGEST, body: { type: "learning", finding: "발견" } }],
    });

    // "tradeoff"는 decision 전용 — learning 타입 body에 잘못 합쳐지는 걸 막는다.
    const next = reviewDraftReducer(before, {
      type: "digest/setBodyField",
      id: "digest-1",
      key: "tradeoff",
      value: ["a"],
    });

    expect(next).toBe(before);
  });
});

describe("reviewDraftReducer — 후보 삭제", () => {
  it("digest/remove는 해당 Digest만 목록에서 뺀다", () => {
    const next = reviewDraftReducer(draft(), {
      type: "digest/remove",
      id: "digest-1",
    });

    expect(next.digests).toHaveLength(1);
    expect(next.digests[0].id).toBe("digest-2");
  });

  // 신규 Reference 후보를 지우면 그걸 인용하던 Digest의 참조도 같이 떨어져야 한다 —
  // 남으면 저장 시 서버가 끊긴 인용이라며 원문 zod 에러(refineReviewPayload)로 거절한다.
  it("reference/remove는 그 후보를 인용하던 Digest의 newReferenceKeys에서도 뺀다", () => {
    const citing: ReviewDigest = {
      ...DIGEST,
      newReferenceKeys: ["ref-1", "ref-2"],
    };
    const before = draft({ digests: [citing, DIGEST_2] });

    const next = reviewDraftReducer(before, {
      type: "reference/remove",
      id: "ref-1",
    });

    expect(next.newReferences).toHaveLength(0);
    expect(next.digests[0].newReferenceKeys).toEqual(["ref-2"]);
    expect(next.digests[1]).toBe(before.digests[1]);
  });
});

// title·body·type이 모두 string(혹은 string 리터럴 유니언)이라, 리듀서의 switch
// 안에서 어느 필드에 쓸지가 실수로 뒤바뀌어도 타입 체크로는 안 잡힌다.
const REFERENCE_FIELD_ACTIONS: {
  action: ReviewDraftAction;
  field: keyof ReviewNewReference;
  expected: unknown;
}[] = [
  {
    action: { type: "reference/setTitle", id: "ref-1", title: "새 이름" },
    field: "title",
    expected: "새 이름",
  },
  {
    action: { type: "reference/setBody", id: "ref-1", body: "새 설명" },
    field: "body",
    expected: "새 설명",
  },
  {
    action: {
      type: "reference/setType",
      id: "ref-1",
      referenceType: "organization",
    },
    field: "type",
    expected: "organization",
  },
];

describe("reviewDraftReducer — Reference 수정", () => {
  it.each(REFERENCE_FIELD_ACTIONS)(
    "$action.type은 대상 신규 Reference의 $field만 바꾼다",
    ({ action, field, expected }) => {
      const next = reviewDraftReducer(draft(), action);

      const target = next.newReferences[0];
      expect(target[field]).toEqual(expected);
      expect({ ...target, [field]: NEW_REFERENCE[field] }).toEqual(
        NEW_REFERENCE,
      );
    },
  );

  it("citedReference/setMergeNote는 대상 기존 Reference의 병합 설명만 바꾼다", () => {
    const next = reviewDraftReducer(draft(), {
      type: "citedReference/setMergeNote",
      id: "cited-1",
      mergeNote: "새 병합 설명",
    });

    expect(next.citedReferences[0]).toEqual({
      ...CITED_REFERENCE,
      mergeNote: "새 병합 설명",
    });
  });
});
