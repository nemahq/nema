import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Digest } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";

const {
  mockSearchNeighbors,
  mockGenerateStructured,
  mockLogRelationJudgment,
  mockLogGetRelations,
} = vi.hoisted(() => ({
  mockSearchNeighbors: vi.fn(),
  mockGenerateStructured: vi.fn(),
  mockLogRelationJudgment: vi.fn().mockResolvedValue(undefined),
  mockLogGetRelations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/infra/vector", () => ({
  getVectorStore: () => ({ searchNeighbors: mockSearchNeighbors }),
}));
vi.mock("@server/infra/llm/provider", () => ({
  getRelationJudgmentProvider: () => ({
    generateStructured: mockGenerateStructured,
  }),
}));
vi.mock("@server/services/relation-judgment-log-service", () => ({
  logRelationJudgment: mockLogRelationJudgment,
}));
vi.mock("@server/services/mcp-tool-call-log-service", () => ({
  logGetRelations: mockLogGetRelations,
}));

import { linkRelations } from "@server/services/digest-relation-service";
import { SUPPORT_WEAKEN_JUDGMENT } from "@server/services/relation-rules";

const SOURCE_NEW = "11111111-1111-4111-8111-111111111111";
const SOURCE_OLD = "22222222-2222-4222-8222-222222222222";
const DECISION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEARNING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OLD_DECISION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IDEA_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PENDING_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CREATED_AT = "2026-08-13T00:00:00.000Z";

interface DigestRow {
  id: string;
  source_id: string;
  type: Digest["type"];
  title: string;
  body: Record<string, string>;
  created_at: string;
}

function digestRow(args: {
  id: string;
  type: Digest["type"];
  sourceId: string;
  title: string;
}): DigestRow {
  const { id, type, sourceId, title } = args;
  const bodyByType: Record<Digest["type"], Record<string, string>> = {
    decision: { choice: title },
    pending: { question: title },
    learning: { finding: title },
    idea: { concept: title },
    assumption: { assumption: title },
  };
  return {
    id,
    source_id: sourceId,
    type,
    title,
    body: bodyByType[type],
    created_at: CREATED_AT,
  };
}

function toDigest(row: DigestRow): Digest {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  } as Digest;
}

interface QueryResult {
  data: DigestRow[];
  error: null;
}

type DigestsQuery = Promise<QueryResult> & {
  in: (column: string, values: string[]) => DigestsQuery;
};

// digests 조회는 .in("id", ...).in("type", ...)으로 두 번 좁힌다 — 필터를 무시하는
// 목이면 "유형 표에 없는 후보가 걸러지는가"를 못 잰다. 그래서 필터를 실제로 적용한다.
function fakeSupabase(rows: DigestRow[]): {
  client: TypedSupabaseClient;
  savedRelations: () => unknown[];
} {
  const saved: unknown[] = [];

  function digestsQuery(filters: Array<[string, string[]]>): DigestsQuery {
    const matched = rows.filter((row) =>
      filters.every(([column, values]) =>
        values.includes(String(row[column as keyof DigestRow])),
      ),
    );
    return Object.assign(Promise.resolve({ data: matched, error: null }), {
      in: (column: string, values: string[]) =>
        digestsQuery([...filters, [column, values]]),
    });
  }

  const from = vi.fn((table: string) => {
    if (table === "digests") {
      return { select: () => digestsQuery([]) };
    }
    return {
      upsert: (values: unknown[]) => {
        saved.push(...values);
        return {
          select: () => Promise.resolve({ data: values, error: null }),
        };
      },
    };
  });

  return {
    client: { from } as unknown as TypedSupabaseClient,
    savedRelations: () => saved,
  };
}

function link(args: { digests: Digest[]; rows: DigestRow[] }) {
  const { client, savedRelations } = fakeSupabase(args.rows);
  return linkRelations({
    supabase: client,
    userId: "user-1",
    sourceId: SOURCE_NEW,
    digests: args.digests,
    judgment: SUPPORT_WEAKEN_JUDGMENT,
  }).then((relations) => ({ relations, saved: savedRelations() }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkRelations", () => {
  it("미결은 후보를 찾지도, 판정하지도 않는다", async () => {
    const pending = digestRow({
      id: PENDING_ID,
      type: "pending",
      sourceId: SOURCE_NEW,
      title: "정산 주기?",
    });

    const { relations } = await link({
      digests: [toDigest(pending)],
      rows: [pending],
    });

    expect(mockSearchNeighbors).not.toHaveBeenCalled();
    expect(mockGenerateStructured).not.toHaveBeenCalled();
    expect(relations.get(PENDING_ID)).toEqual([]);
  });

  it("같은 원문 안에서는 자기보다 앞선 다이제스트만 후보가 된다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "주 1회",
    });
    const learning = digestRow({
      id: LEARNING_ID,
      type: "learning",
      sourceId: SOURCE_NEW,
      title: "7배 비쌈",
    });
    // 결정이 먼저, 학습이 나중 — 벡터 검색은 둘 다 서로를 이웃으로 돌려준다.
    mockSearchNeighbors.mockImplementation(
      ({ digestId }: { digestId: string }) =>
        [
          { digestId: DECISION_ID, score: 0.5 },
          { digestId: LEARNING_ID, score: 0.5 },
        ].filter((hit) => hit.digestId !== digestId),
    );
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "support", from: null }],
    });

    const { relations, saved } = await link({
      digests: [toDigest(decision), toDigest(learning)],
      rows: [decision, learning],
    });

    // 결정(0번)에게 학습은 뒤에 있어 후보가 아니고, 학습(1번)에게 결정은 앞이라 후보다.
    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([
      {
        from_digest_id: LEARNING_ID,
        to_digest_id: DECISION_ID,
        type: "support",
      },
    ]);
    expect(relations.get(LEARNING_ID)).toEqual([
      { type: "supports", digestId: DECISION_ID, title: "주 1회" },
    ]);
    expect(relations.get(DECISION_ID)).toEqual([
      { type: "supported_by", digestId: LEARNING_ID, title: "7배 비쌈" },
    ]);
  });

  it("둘 다 결정이면 LLM이 답한 방향으로 잇는다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "새 결정",
    });
    const older = digestRow({
      id: OLD_DECISION_ID,
      type: "decision",
      sourceId: SOURCE_OLD,
      title: "옛 결정",
    });
    mockSearchNeighbors.mockResolvedValue([
      { digestId: OLD_DECISION_ID, score: 0.4 },
    ]);
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "weaken", from: "new" }],
    });

    const { saved } = await link({
      digests: [toDigest(decision)],
      rows: [decision, older],
    });

    expect(saved).toEqual([
      {
        from_digest_id: DECISION_ID,
        to_digest_id: OLD_DECISION_ID,
        type: "weaken",
      },
    ]);
  });

  it("둘 다 결정인데 방향을 안 답하면 시간순으로 추측하지 않고 버린다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "새 결정",
    });
    const older = digestRow({
      id: OLD_DECISION_ID,
      type: "decision",
      sourceId: SOURCE_OLD,
      title: "옛 결정",
    });
    mockSearchNeighbors.mockResolvedValue([
      { digestId: OLD_DECISION_ID, score: 0.4 },
    ]);
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "support", from: null }],
    });

    const { relations, saved } = await link({
      digests: [toDigest(decision)],
      rows: [decision, older],
    });

    expect(saved).toEqual([]);
    expect(relations.get(DECISION_ID)).toEqual([]);
  });

  it("표가 허용하지 않는 관계 종류는 버린다 — 아이디어는 결정을 약화하지 못한다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "새 결정",
    });
    const idea = digestRow({
      id: IDEA_ID,
      type: "idea",
      sourceId: SOURCE_OLD,
      title: "던져둔 발상",
    });
    mockSearchNeighbors.mockResolvedValue([{ digestId: IDEA_ID, score: 0.4 }]);
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "weaken", from: null }],
    });

    const { saved } = await link({
      digests: [toDigest(decision)],
      rows: [decision, idea],
    });

    expect(saved).toEqual([]);
  });

  it("판정이 실패한 다이제스트만 관계를 잃고 나머지는 이어진다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "새 결정",
    });
    const learning = digestRow({
      id: LEARNING_ID,
      type: "learning",
      sourceId: SOURCE_NEW,
      title: "알게 됨",
    });
    const older = digestRow({
      id: OLD_DECISION_ID,
      type: "decision",
      sourceId: SOURCE_OLD,
      title: "옛 결정",
    });
    mockSearchNeighbors.mockResolvedValue([
      { digestId: OLD_DECISION_ID, score: 0.4 },
    ]);
    mockGenerateStructured
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({
        verdicts: [{ candidate: 1, relation: "support", from: null }],
      });

    const { relations } = await link({
      digests: [toDigest(decision), toDigest(learning)],
      rows: [decision, learning, older],
    });

    expect(relations.get(DECISION_ID)).toEqual([]);
    expect(relations.get(LEARNING_ID)).toEqual([
      { type: "supports", digestId: OLD_DECISION_ID, title: "옛 결정" },
    ]);
  });

  it("판정에 넘긴 후보의 점수와 판정 결과를 로그에 남긴다", async () => {
    const learning = digestRow({
      id: LEARNING_ID,
      type: "learning",
      sourceId: SOURCE_NEW,
      title: "알게 됨",
    });
    const older = digestRow({
      id: OLD_DECISION_ID,
      type: "decision",
      sourceId: SOURCE_OLD,
      title: "옛 결정",
    });
    mockSearchNeighbors.mockResolvedValue([
      { digestId: OLD_DECISION_ID, score: 0.42 },
    ]);
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "none", from: null }],
    });

    await link({ digests: [toDigest(learning)], rows: [learning, older] });

    expect(mockLogRelationJudgment).toHaveBeenCalledWith({
      userId: "user-1",
      digestId: LEARNING_ID,
      candidates: [{ digestId: OLD_DECISION_ID, score: 0.42, verdict: "none" }],
    });
  });
});
