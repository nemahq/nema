import { describe, expect, it } from "vitest";
import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import { changesetDisplayTitle } from "./utils";

const ZERO_EFFECT = {
  statement: 0,
  relation: 0,
  source: 0,
  digest: 0,
  reference: 0,
};

const fakeT = (
  key: TranslationKey,
  options?: CombinedOptions<DefaultParamType>,
) => (options ? `${key}(${options.count})` : key);

describe("changesetDisplayTitle", () => {
  it("sourceTitle이 있으면 effect 요약 대신 그 값을 쓴다", () => {
    const title = changesetDisplayTitle(
      { sourceTitle: "회의록 요약", effect: { ...ZERO_EFFECT, digest: 3 } },
      fakeT,
    );

    expect(title).toBe("회의록 요약");
  });

  it("sourceTitle이 없으면 0보다 큰 effect만 라벨-카운트로 나열한다", () => {
    const title = changesetDisplayTitle(
      {
        sourceTitle: null,
        effect: { ...ZERO_EFFECT, digest: 2, reference: 1 },
      },
      fakeT,
    );

    expect(title).toBe("review.effect_digest(2) · review.effect_reference(1)");
  });

  it("모든 effect가 0이면 review.effect_none으로 폴백한다", () => {
    const title = changesetDisplayTitle(
      { sourceTitle: null, effect: ZERO_EFFECT },
      fakeT,
    );

    expect(title).toBe("review.effect_none");
  });
});
