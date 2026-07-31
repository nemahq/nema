import { describe, expect, it } from "vitest";
import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import {
  changesetDisplayTitle,
  changesetRowAuthorLabel,
  summarizeChangesetEffect,
} from "./utils";

// 파라미터 이름까지 문자열에 실어야 이름이 잘못 바뀌는 실수(예: depth를 markers로
// 오타)도 테스트가 잡는다 — 값만 이어붙이면 순서가 우연히 맞아 통과해버린다.
const fakeT = (
  key: TranslationKey,
  options?: CombinedOptions<DefaultParamType>,
) =>
  options
    ? `${key}(${Object.entries(options)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : key;

describe("changesetDisplayTitle", () => {
  it("title이 있으면 그 값을 그대로 쓴다", () => {
    const title = changesetDisplayTitle(
      { title: "회의록 요약", number: 12 },
      fakeT,
    );

    expect(title).toBe("회의록 요약");
  });

  it("title이 없으면 번호 기반 자리표시자로 대체한다", () => {
    const title = changesetDisplayTitle({ title: null, number: 12 }, fakeT);

    expect(title).toBe("review.changeset_fallback_title(number=12)");
  });

  // revert도 다른 타입과 동일하게 취급한다 — "OO 되돌림" 조합(따옴표 감싸기·
  // 중첩 포함)은 revert_changeset RPC 호출 전에 서버(changeset-service.ts
  // composeRevertTitle)가 이미 완성해 저장하므로, FE는 title==null 여부만 본다.
  it("revert 타입도 title이 이미 완성된 값이라 그대로 쓴다", () => {
    const title = changesetDisplayTitle(
      { title: '"회의록 요약" 되돌림', number: 12 },
      fakeT,
    );

    expect(title).toBe('"회의록 요약" 되돌림');
  });
});

describe("summarizeChangesetEffect", () => {
  it("digest만 0보다 크면 digest 카운트만 보여준다", () => {
    const summary = summarizeChangesetEffect(
      { digest: 2, reference: 0, relation: 0 },
      fakeT,
    );

    expect(summary).toBe("review.effect_digest(count=2)");
  });

  it("digest·reference 둘 다 0보다 크면 순서대로 이어붙인다", () => {
    const summary = summarizeChangesetEffect(
      { digest: 2, reference: 1, relation: 0 },
      fakeT,
    );

    expect(summary).toBe(
      "review.effect_digest(count=2) · review.effect_reference(count=1)",
    );
  });

  // 확신 자동 적용 배치(relationJudgment=false인 relation 타입)에서만 호출부가
  // relation을 실어 보낸다 — changesetShowsEffectSummary가 그 게이트.
  it("relation만 0보다 크면 relation 카운트만 보여준다", () => {
    const summary = summarizeChangesetEffect(
      { digest: 0, reference: 0, relation: 3 },
      fakeT,
    );

    expect(summary).toBe("review.effect_relation(count=3)");
  });

  it("셋 다 0이면 null을 반환한다(호출부가 폴백 문구를 직접 고른다)", () => {
    const summary = summarizeChangesetEffect(
      { digest: 0, reference: 0, relation: 0 },
      fakeT,
    );

    expect(summary).toBeNull();
  });
});

describe("changesetRowAuthorLabel", () => {
  it("ingestion·relation이 open이면 항상 AI다(타입만으로 결정, authorName 무시)", () => {
    const label = changesetRowAuthorLabel({
      type: "ingestion",
      state: "open",
      authorName: null,
      closedByName: null,
      t: fakeT,
    });

    expect(label).toBe("review.author_ai");
  });

  it("revert가 open이면 되돌리기를 누른 사람의 authorName을 쓴다", () => {
    const label = changesetRowAuthorLabel({
      type: "revert",
      state: "open",
      authorName: "Kyle",
      closedByName: null,
      t: fakeT,
    });

    expect(label).toBe("Kyle");
  });

  it("closed면 closedByName이 있으면 그 이름을 쓴다", () => {
    const label = changesetRowAuthorLabel({
      type: "relation",
      state: "applied",
      authorName: null,
      closedByName: "Kyle",
      t: fakeT,
    });

    expect(label).toBe("Kyle");
  });

  it("closed인데 closedByName이 없으면 AI가 닫은 것이다", () => {
    const label = changesetRowAuthorLabel({
      type: "relation",
      state: "discarded",
      authorName: null,
      closedByName: null,
      t: fakeT,
    });

    expect(label).toBe("review.author_ai");
  });
});
