import { describe, expect, it } from "vitest";
import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import { changesetDisplayTitle, summarizeChangesetEffect } from "./utils";

const fakeT = (
  key: TranslationKey,
  options?: CombinedOptions<DefaultParamType>,
) => (options ? `${key}(${options.count ?? options.number})` : key);

describe("changesetDisplayTitle", () => {
  it("sourceTitle이 있으면 그 값을 그대로 쓴다", () => {
    const title = changesetDisplayTitle(
      { sourceTitle: "회의록 요약", number: 3 },
      fakeT,
    );

    expect(title).toBe("회의록 요약");
  });

  it("sourceTitle이 없으면 번호 플레이스홀더로 폴백한다", () => {
    const title = changesetDisplayTitle(
      { sourceTitle: null, number: 3 },
      fakeT,
    );

    expect(title).toBe("review.changeset_fallback_title(3)");
  });
});

describe("summarizeChangesetEffect", () => {
  it("digest만 0보다 크면 digest 카운트만 보여준다", () => {
    const summary = summarizeChangesetEffect(
      { digest: 2, reference: 0 },
      fakeT,
    );

    expect(summary).toBe("review.effect_digest(2)");
  });

  it("digest·reference 둘 다 0보다 크면 순서대로 이어붙인다", () => {
    const summary = summarizeChangesetEffect(
      { digest: 2, reference: 1 },
      fakeT,
    );

    expect(summary).toBe(
      "review.effect_digest(2) · review.effect_reference(1)",
    );
  });

  it("둘 다 0이면 null을 반환한다(호출부가 폴백 문구를 직접 고른다)", () => {
    const summary = summarizeChangesetEffect(
      { digest: 0, reference: 0 },
      fakeT,
    );

    expect(summary).toBeNull();
  });
});
