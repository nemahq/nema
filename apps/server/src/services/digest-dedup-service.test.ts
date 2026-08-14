import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DigestType } from "@nema-io/shared";

const { mockGenerateStructured } = vi.hoisted(() => ({
  mockGenerateStructured: vi.fn(),
}));

vi.mock("@server/infra/llm/provider", () => ({
  getDigestDedupProvider: () => ({
    generateStructured: mockGenerateStructured,
  }),
}));

import { dropContainedDigests } from "@server/services/digest-dedup-service";

function digest(type: DigestType, title: string) {
  return { type, title, body: { title } };
}

const DECISION = digest("decision", "리플레이 방식으로 전환");
const LEARNING = digest("learning", "단순한 동작도 성공률이 낮을 수 있음");
const ASSUMPTION = digest("assumption", "역할 분리의 전제");

function respondWith(duplicates: unknown[]) {
  mockGenerateStructured.mockResolvedValue({ duplicates });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dropContainedDigests", () => {
  it("다이제스트가 하나면 판정을 부르지 않는다", async () => {
    const result = await dropContainedDigests([DECISION]);

    expect(mockGenerateStructured).not.toHaveBeenCalled();
    expect(result.kept).toEqual([DECISION]);
    expect(result.dropped).toEqual([]);
  });

  it("판정이 실패하면 걸러내지 않고 전부 남긴다", async () => {
    mockGenerateStructured.mockRejectedValue(new Error("rate limit"));

    const result = await dropContainedDigests([DECISION, LEARNING]);

    expect(result.kept).toEqual([DECISION, LEARNING]);
    expect(result.dropped).toEqual([]);
  });

  it("담고 있다는 쪽을 짚어 뺀다", async () => {
    respondWith([
      {
        digest: 2,
        containedIn: 1,
        field: "alternatives",
        reason: "same rejected option",
      },
    ]);

    const result = await dropContainedDigests([DECISION, LEARNING]);

    expect(result.kept).toEqual([DECISION]);
    expect(result.dropped).toEqual([
      {
        digest: LEARNING,
        containedIn: DECISION,
        field: "alternatives",
        reason: "same rejected option",
      },
    ]);
  });

  // 둘 다 빼면 겹침을 지운 게 아니라 판단 둘을 통째로 잃는다.
  it("서로를 가리키면 둘 다 남긴다", async () => {
    respondWith([
      { digest: 1, containedIn: 2, field: "evidence", reason: "same" },
      { digest: 2, containedIn: 1, field: "reason", reason: "same" },
    ]);

    const result = await dropContainedDigests([DECISION, LEARNING]);

    expect(result.kept).toEqual([DECISION, LEARNING]);
    expect(result.dropped).toEqual([]);
  });

  // A가 B에, B가 C에 들어 있다는 답. B를 빼면 A의 내용도 함께 사라진다.
  it("담고 있다는 쪽도 빠질 참이면 그 제거만 취소한다", async () => {
    respondWith([
      { digest: 1, containedIn: 2, field: "branches", reason: "same" },
      { digest: 2, containedIn: 3, field: "evidence", reason: "same" },
    ]);

    const result = await dropContainedDigests([DECISION, LEARNING, ASSUMPTION]);

    expect(result.kept).toEqual([DECISION, ASSUMPTION]);
    expect(result.dropped.map((entry) => entry.digest)).toEqual([LEARNING]);
  });

  it("범위 밖 번호와 자기 자신을 가리킨 판정은 버린다", async () => {
    respondWith([
      { digest: 3, containedIn: 1, field: "reason", reason: "out of range" },
      { digest: 0, containedIn: 1, field: "reason", reason: "out of range" },
      { digest: 2, containedIn: 2, field: "reason", reason: "self" },
    ]);

    const result = await dropContainedDigests([DECISION, LEARNING]);

    expect(result.kept).toEqual([DECISION, LEARNING]);
    expect(result.dropped).toEqual([]);
  });
});
