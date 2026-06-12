import { describe, expect, it } from "vitest";

import { extractDraftContext } from "./drafting";

describe("extractDraftContext", () => {
  it("짧은 본문은 그대로 반환", () => {
    expect(extractDraftContext("팀 회의록")).toBe("팀 회의록");
  });

  it("마크다운 헤딩 접두사를 제거", () => {
    expect(extractDraftContext("## 팀 회의록")).toBe("팀 회의록");
    expect(extractDraftContext("# 프로젝트 계획")).toBe("프로젝트 계획");
  });

  it("50자 초과 시 잘라내고 ... 추가", () => {
    const longLine = "가".repeat(60);
    const result = extractDraftContext(longLine);
    expect(result).toBe("가".repeat(50) + "...");
  });

  it("여러 줄에서 첫 줄만 추출", () => {
    expect(extractDraftContext("첫 줄\n둘째 줄\n셋째 줄")).toBe("첫 줄");
  });

  it("빈 첫 줄이면 빈 문자열 반환", () => {
    expect(extractDraftContext("\n둘째 줄")).toBe("");
  });
});
