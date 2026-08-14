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
  hidden_at?: string | null;
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

interface RelationRow {
  from_digest_id: string;
  to_digest_id: string;
  type: string;
}

interface QueryResult {
  data: DigestRow[];
  error: null;
}

type DigestsQuery = Promise<QueryResult> & {
  in: (column: string, values: string[]) => DigestsQuery;
  is: (column: string, value: null) => DigestsQuery;
};

// digests 조회는 .in("id", ...).in("type", ...)으로 두 번 좁힌다 — 필터를 무시하는
// 목이면 "유형 표에 없는 후보가 걸러지는가"를 못 잰다. 그래서 필터를 실제로 적용한다.
function fakeSupabase(args: {
  rows: DigestRow[];
  // 이미 이어져 있는 쌍 — insert가 unique 위반으로 튕기는 상황을 만든다.
  existingPairs?: Array<[string, string]>;
}): {
  client: TypedSupabaseClient;
  savedRelations: () => RelationRow[];
} {
  const { rows, existingPairs = [] } = args;
  const saved: RelationRow[] = [];

  // 가림(hidden_at)까지 흉내내야 "가려진 후보가 빠지는가"를 잴 수 있다 — 픽스처는
  // hidden_at을 안 달면 살아있는 것으로 본다.
  function digestsQuery(
    filters: Array<[string, string[]]>,
    onlyVisible: boolean,
  ): DigestsQuery {
    const matched = rows.filter(
      (row) =>
        filters.every(([column, values]) =>
          values.includes(String(row[column as keyof DigestRow])),
        ) &&
        (!onlyVisible || (row.hidden_at ?? null) === null),
    );
    return Object.assign(Promise.resolve({ data: matched, error: null }), {
      in: (column: string, values: string[]) =>
        digestsQuery([...filters, [column, values]], onlyVisible),
      is: () => digestsQuery(filters, true),
    });
  }

  // 방향을 무시한 쌍에 걸린 unique 인덱스를 흉내낸다 — 순서만 뒤집힌 쌍도 같은 쌍이다.
  function isTaken(row: RelationRow): boolean {
    return existingPairs.some(
      ([first, second]) =>
        (first === row.from_digest_id && second === row.to_digest_id) ||
        (first === row.to_digest_id && second === row.from_digest_id),
    );
  }

  const from = vi.fn((table: string) => {
    if (table === "digests") {
      return { select: () => digestsQuery([], false) };
    }
    return {
      insert: (row: RelationRow) => {
        if (isTaken(row)) {
          return Promise.resolve({ error: { code: "23505" } });
        }
        existingPairs.push([row.from_digest_id, row.to_digest_id]);
        saved.push(row);
        return Promise.resolve({ error: null });
      },
    };
  });

  return {
    client: { from } as unknown as TypedSupabaseClient,
    savedRelations: () => saved,
  };
}

function link(args: {
  digests: Digest[];
  rows: DigestRow[];
  existingPairs?: Array<[string, string]>;
}) {
  const { client, savedRelations } = fakeSupabase({
    rows: args.rows,
    existingPairs: args.existingPairs,
  });
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

  it("후보가 상한을 넘으면 뜻이 가까운 것부터 상한만큼만 판정에 넘긴다", async () => {
    const decision = digestRow({
      id: DECISION_ID,
      type: "decision",
      sourceId: SOURCE_NEW,
      title: "새 결정",
    });
    // 상한(5)보다 하나 많은 후보를 점수 오름차순으로 준다 — 잘리는 건 가장 먼 것이어야 한다.
    const candidates = Array.from({ length: 6 }, (_, order) =>
      digestRow({
        id: `0000000${order}-0000-4000-8000-000000000000`,
        type: "learning",
        sourceId: SOURCE_OLD,
        title: `후보 ${order}`,
      }),
    );
    mockSearchNeighbors.mockResolvedValue(
      candidates.map((row, order) => ({
        digestId: row.id,
        score: 0.3 + order / 100,
      })),
    );
    mockGenerateStructured.mockResolvedValue({ verdicts: [] });

    await link({
      digests: [toDigest(decision)],
      rows: [decision, ...candidates],
    });

    expect(mockSearchNeighbors).toHaveBeenCalledWith({
      userId: "user-1",
      digestId: DECISION_ID,
      limit: 30,
      minScore: 0.2,
    });
    expect(mockLogRelationJudgment).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: candidates
          .slice(1)
          .reverse()
          .map((row, order) => ({
            digestId: row.id,
            score: 0.3 + (5 - order) / 100,
            verdict: "unanswered",
          })),
      }),
    );
  });

  // 벡터는 가림과 함께 지우지만 그 삭제는 실패해도 경고만 남는다 — 고아 벡터가
  // 후보로 돌아오면 사용자가 지운 다이제스트의 제목이 관련 목록에 뜬다.
  it("가려진 다이제스트는 고아 벡터로 걸려도 후보에서 빠진다", async () => {
    const learning = digestRow({
      id: LEARNING_ID,
      type: "learning",
      sourceId: SOURCE_NEW,
      title: "알게 됨",
    });
    const hidden = {
      ...digestRow({
        id: OLD_DECISION_ID,
        type: "decision",
        sourceId: SOURCE_OLD,
        title: "지워진 결정",
      }),
      hidden_at: CREATED_AT,
    };
    mockSearchNeighbors.mockResolvedValue([
      { digestId: OLD_DECISION_ID, score: 0.8 },
    ]);

    const { relations } = await link({
      digests: [toDigest(learning)],
      rows: [learning, hidden],
    });

    expect(mockGenerateStructured).not.toHaveBeenCalled();
    expect(relations.get(LEARNING_ID)).toEqual([]);
  });

  it("이미 이어진 쌍은 건너뛰고 나머지 쌍은 그대로 저장한다", async () => {
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
    mockGenerateStructured.mockResolvedValue({
      verdicts: [{ candidate: 1, relation: "support", from: null }],
    });

    // 방향만 뒤집힌 쌍이 이미 있다 — 동시 던지기로 같은 쌍이 반대로 먼저 이어진 상태.
    const { saved } = await link({
      digests: [toDigest(learning)],
      rows: [learning, older],
      existingPairs: [[OLD_DECISION_ID, LEARNING_ID]],
    });

    expect(saved).toEqual([]);
  });

  it("판정이 실패하면 후보와 점수를 실패로 남긴다 — 후보가 없던 것과 구별된다", async () => {
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
      { digestId: OLD_DECISION_ID, score: 0.55 },
    ]);
    mockGenerateStructured.mockRejectedValue(new Error("rate limit"));

    await link({ digests: [toDigest(learning)], rows: [learning, older] });

    expect(mockLogRelationJudgment).toHaveBeenCalledWith({
      userId: "user-1",
      digestId: LEARNING_ID,
      candidates: [
        { digestId: OLD_DECISION_ID, score: 0.55, verdict: "failed" },
      ],
    });
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
