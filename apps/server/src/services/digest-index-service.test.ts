import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Digest } from "@nema-io/shared";

const mockUpsertDigests = vi.fn().mockResolvedValue(undefined);
const mockEmbeddingProvider = { providerId: "test" };
const mockVectorStore = { upsertDigests: mockUpsertDigests };

vi.mock("@server/infra/embedding", () => ({
  getEmbeddingProvider: () => mockEmbeddingProvider,
}));
vi.mock("@server/infra/vector", () => ({
  getVectorStore: () => mockVectorStore,
}));

import { indexDigests } from "@server/services/digest-index-service";

function digestOf(overrides: Partial<Digest> & Pick<Digest, "id">): Digest {
  return {
    type: "decision",
    title: "제목",
    body: {},
    createdAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  } as Digest;
}

describe("indexDigests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("다이제스트가 없으면 upsert를 호출하지 않는다", async () => {
    await indexDigests({ userId: "user-1", digests: [] });
    expect(mockUpsertDigests).not.toHaveBeenCalled();
  });

  it("있는 칸만 필드 키와 함께 한 문자열로 조립해 배치 1회로 넘긴다", async () => {
    const digests = [
      digestOf({
        id: "digest-1",
        type: "decision",
        title: "결정 제목",
        body: { situation: "상황 내용", choice: "선택 내용" },
      }),
      digestOf({
        id: "digest-2",
        type: "learning",
        title: "학습 제목",
        body: { finding: "발견 내용" },
      }),
    ];

    await indexDigests({ userId: "user-1", digests });

    expect(mockUpsertDigests).toHaveBeenCalledTimes(1);
    const [, items] = mockUpsertDigests.mock.calls[0];
    expect(items).toEqual([
      {
        digestId: "digest-1",
        userId: "user-1",
        text: "title: 결정 제목 / situation: 상황 내용 / choice: 선택 내용",
        createdAt: "2026-08-13T00:00:00.000Z",
      },
      {
        digestId: "digest-2",
        userId: "user-1",
        text: "title: 학습 제목 / finding: 발견 내용",
        createdAt: "2026-08-13T00:00:00.000Z",
      },
    ]);
  });

  it("배열 칸(트레이드오프 등)은 쉼표로 이어 붙인다", async () => {
    const digests = [
      digestOf({
        id: "digest-1",
        type: "decision",
        title: "결정 제목",
        body: {
          choice: "선택",
          tradeoff: ["트레이드오프 A", "트레이드오프 B"],
        },
      }),
    ];

    await indexDigests({ userId: "user-1", digests });

    const [, items] = mockUpsertDigests.mock.calls[0];
    expect(items[0].text).toBe(
      "title: 결정 제목 / choice: 선택 / tradeoff: 트레이드오프 A, 트레이드오프 B",
    );
  });
});
