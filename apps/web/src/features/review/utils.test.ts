import { describe, expect, it } from "vitest";
import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import { changesetDisplayTitle, summarizeChangesetEffect } from "./utils";

const fakeT = (
  key: TranslationKey,
  options?: CombinedOptions<DefaultParamType>,
) => (options ? `${key}(${Object.values(options).join(",")})` : key);

describe("changesetDisplayTitle", () => {
  it("title이 있으면 그 값을 그대로 쓴다", () => {
    const title = changesetDisplayTitle(
      { title: "회의록 요약", number: 12, type: "ingestion", revertDepth: 0 },
      fakeT,
    );

    expect(title).toBe("회의록 요약");
  });

  it("title이 없으면 번호 기반 자리표시자로 대체한다", () => {
    const title = changesetDisplayTitle(
      { title: null, number: 12, type: "ingestion", revertDepth: 0 },
      fakeT,
    );

    expect(title).toBe("review.changeset_fallback_title(12)");
  });

  it("revert depth=1이면 marker를 한 번만 실어 revert_title로 넘긴다", () => {
    const title = changesetDisplayTitle(
      { title: "회의록 요약", number: 12, type: "revert", revertDepth: 1 },
      fakeT,
    );

    expect(title).toBe("review.revert_title(회의록 요약,review.revert_marker)");
  });

  it("revert depth=2(되돌리기의 되돌리기)면 marker를 두 번 겹쳐 싣는다", () => {
    const title = changesetDisplayTitle(
      { title: "회의록 요약", number: 12, type: "revert", revertDepth: 2 },
      fakeT,
    );

    expect(title).toBe(
      "review.revert_title(회의록 요약,review.revert_marker review.revert_marker)",
    );
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
