import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import type { EmbeddingProvider } from "@server/infra/embedding";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { VectorStore } from "@server/infra/vector";
import type { RelationProposal } from "@server/prompts/relation-judgment";

import type { PendingSource, PendingStatement } from "./types";
import {
  canFormRelations,
  chunkStatements,
  createStatementSyncWorker,
  dedupeChanges,
  gateProposals,
  orderBySourceAppearance,
  POLL_INTERVAL_MS,
  reconcileChanges,
  selectCandidateIds,
} from "./worker";

const SOURCE_ID = "a0000000-0000-4000-a000-000000000001";
const SPACE_ID = "b0000000-0000-4000-a000-000000000001";
const STMT_ID_1 = "c0000000-0000-4000-a000-000000000001";
const STMT_ID_2 = "c0000000-0000-4000-a000-000000000002";

const PENDING_SOURCE: PendingSource = {
  id: SOURCE_ID,
  space_id: SPACE_ID,
  author_id: null,
  session_id: null,
  body: "테스트 원문",
  created_at: "2026-06-11T00:00:00.000Z",
};

function pendingStatement(
  overrides: Partial<PendingStatement>,
): PendingStatement {
  return {
    id: STMT_ID_1,
    space_id: SPACE_ID,
    content: "테스트 진술",
    type: "claim",
    confidence: "certain",
    status: "active",
    created_at: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

// 테이블 직접 조회(.from) 체인 stub — select/eq/in/order 무시하고 canned rows로 resolve
function fromStub(rows: unknown[]) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) {
    stub[method] = () => stub;
  }
  stub["then"] = (resolve: (value: { data: unknown; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return stub;
}

// rpc 이름별 응답 큐 — shift해서 반환하고, 비면 fallback. tables는 .from 직접 조회용.
function mockSupabase(
  queues: Record<string, unknown[]>,
  tables: Record<string, unknown[]> = {},
) {
  const fallback: Record<string, unknown> = {
    read_sync_events: [],
    fetch_pending_sources: [],
    fetch_pending_statements: [],
    fetch_pending_linking_sources: [],
  };
  const rpc = vi.fn(async (name: string) => {
    const queue = queues[name];
    if (queue && queue.length > 0) {
      return { data: queue.shift(), error: null };
    }
    return { data: fallback[name] ?? null, error: null };
  });
  const from = vi.fn((table: string) => fromStub(tables[table] ?? []));
  return { client: { rpc, from } as unknown as TypedSupabaseClient, rpc };
}

function mockLlm(statements: unknown[]): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({ statements }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn().mockResolvedValue(""),
  };
}

function mockEmbedding(): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: 2,
    embed: vi.fn(),
  };
}

function mockVectorStore(): VectorStore {
  return {
    ensureCollection: vi.fn(),
    upsertStatements: vi.fn().mockResolvedValue(undefined),
    deleteStatements: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    searchNeighbors: vi.fn().mockResolvedValue([]),
  };
}

const NOTIFY_ROW = { msg_id: 1, read_ct: 1, message: { type: "notify" } };

function rpcCalls(rpc: ReturnType<typeof vi.fn>, name: string) {
  return rpc.mock.calls.filter(([n]) => n === name);
}

async function runOnePoll(deps: {
  supabase: TypedSupabaseClient;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
}) {
  // 워커는 task 라우터(forTask)를 받는다(NEM-146) — 테스트는 두 task 모두 같은 mock으로 해석.
  const { llm, ...rest } = deps;
  const worker = createStatementSyncWorker({ ...rest, forTask: () => llm });
  worker.start(); // start가 즉시 sweep 1회 실행
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // 첫 poll까지
  await worker.stop();
}

describe("createStatementSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("추출 성공 — index 파생·claim 무확신 guess 보정 후 apply_ingestion_changeset 호출", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });
    const llm = mockLlm([
      { content: "확정 결정.", type: "claim", confidence: "certain" },
      { content: "확신도 빠진 추정.", type: "claim", confidence: null },
      { content: "할 일.", type: "todo", confidence: null },
    ]);

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    const applies = rpcCalls(rpc, "apply_ingestion_changeset");
    expect(applies).toHaveLength(1);
    expect(applies[0][1]).toEqual({
      p_source_id: SOURCE_ID,
      p_statements: [
        {
          content: "확정 결정.",
          type: "claim",
          confidence: "certain",
          index: 0,
        },
        {
          content: "확신도 빠진 추정.",
          type: "claim",
          confidence: "guess",
          index: 1,
        },
        { content: "할 일.", type: "todo", confidence: null, index: 2 },
      ],
    });
    // 메시지는 ack됐다
    expect(rpcCalls(rpc, "ack_sync_event")).toHaveLength(1);
  });

  it("진술 0개(노이즈뿐) — changeset 없이 complete_source_extraction만 호출", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(0);
    const completes = rpcCalls(rpc, "complete_source_extraction");
    expect(completes).toHaveLength(1);
    expect(completes[0][1]).toEqual({ p_source_id: SOURCE_ID });
  });

  it("추출 LLM 실패 — increment_source_extraction_retry에 에러 메시지 기록", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });
    const llm: LlmProvider = {
      generateStructured: vi.fn().mockRejectedValue(new Error("llm boom")),
      async *generateStream() {
        yield "";
      },
      generateText: vi.fn().mockResolvedValue(""),
    };

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    const retries = rpcCalls(rpc, "increment_source_extraction_retry");
    expect(retries).toHaveLength(1);
    expect(retries[0][1]).toMatchObject({
      p_source_id: SOURCE_ID,
      p_error_message: "llm boom",
    });
    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(0);
  });

  it("임베딩 선언적 동기화 — active는 upsert, archived는 delete 후 각각 complete", async () => {
    const active = pendingStatement({ id: STMT_ID_1, status: "active" });
    const archived = pendingStatement({
      id: STMT_ID_2,
      status: "archived",
      type: "todo",
      confidence: null,
    });
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_statements: [[active, archived]],
    });
    const vectorStore = mockVectorStore();
    const embedding = mockEmbedding();

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding,
      vectorStore,
    });

    expect(vectorStore.upsertStatements).toHaveBeenCalledTimes(1);
    expect(vectorStore.upsertStatements).toHaveBeenCalledWith(embedding, [
      {
        statementId: STMT_ID_1,
        spaceId: SPACE_ID,
        content: "테스트 진술",
        type: "claim",
        confidence: "certain",
        createdAt: "2026-06-11T00:00:00.000Z",
      },
    ]);
    expect(vectorStore.deleteStatements).toHaveBeenCalledWith([STMT_ID_2]);

    const completes = rpcCalls(rpc, "complete_statement_ingestion");
    expect(completes.map(([, args]) => args)).toEqual(
      expect.arrayContaining([
        { p_statement_id: STMT_ID_1 },
        { p_statement_id: STMT_ID_2 },
      ]),
    );
  });

  it("임베딩 배치 실패 — 배치원 전부 retry, complete는 호출되지 않음", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_statements: [
        [
          pendingStatement({ id: STMT_ID_1 }),
          pendingStatement({ id: STMT_ID_2 }),
        ],
      ],
    });
    const vectorStore = mockVectorStore();
    vectorStore.upsertStatements = vi
      .fn()
      .mockRejectedValue(new Error("qdrant down"));

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding: mockEmbedding(),
      vectorStore,
    });

    const retries = rpcCalls(rpc, "increment_statement_ingestion_retry");
    expect(retries.map(([, args]) => args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_statement_id: STMT_ID_1,
          p_error_message: "qdrant down",
        }),
        expect.objectContaining({
          p_statement_id: STMT_ID_2,
          p_error_message: "qdrant down",
        }),
      ]),
    );
    expect(rpcCalls(rpc, "complete_statement_ingestion")).toHaveLength(0);
  });

  it("한 사이클에서 추출이 만든 진술을 이어서 임베딩한다 (추출 먼저, 임베딩 다음)", async () => {
    // 1차 임베딩 인출은 비고, 추출 후 2차 사이클 인출에서 진술이 나오는 시나리오
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
      fetch_pending_statements: [[], [pendingStatement({})]],
    });
    const vectorStore = mockVectorStore();

    await runOnePoll({
      supabase: client,
      llm: mockLlm([
        { content: "결정.", type: "claim", confidence: "certain" },
      ]),
      embedding: mockEmbedding(),
      vectorStore,
    });

    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(1);
    expect(vectorStore.upsertStatements).toHaveBeenCalledTimes(1);

    // 순서: apply가 upsert보다 먼저
    const applyOrder =
      rpc.mock.invocationCallOrder[
        rpc.mock.calls.findIndex(([n]) => n === "apply_ingestion_changeset")
      ];
    const upsertOrder = (
      vectorStore.upsertStatements as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    expect(applyOrder).toBeLessThan(upsertOrder);
  });

  // --- 분할 경로 (long-input-chunking 설계 5장) ---

  // 임계선(1,500토큰) 초과 합성 장문 — 문단마다 고유 번호로 순서 검증 가능
  function longBody(): string {
    const paragraphs: string[] = [];
    for (let p = 0; p < 60; p++) {
      paragraphs.push(
        `${p}번째 안건으로 배포 파이프라인의 캐시 무효화 정책을 검토했고 결론은 위키에 정리하기로 했다. ` +
          `근거는 지난 분기 장애 회고에서 나온 캐시 불일치 사례 세 건이다.`,
      );
    }
    return paragraphs.join("\n\n");
  }

  it("장문 분할 — 청크 병렬 추출 결과가 원문 순서로 연결돼 apply 1회에 담긴다", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[{ ...PENDING_SOURCE, body: longBody() }]],
    });

    // 청크마다 그 청크 본문의 첫 안건 번호를 진술로 돌려준다 — 연결 순서가
    // 호출 완료 순서가 아니라 청크(원문) 순서임을 내용으로 검증
    const generateStructured = vi.fn(
      async (params: { messages: Array<{ content: string }> }) => {
        const content = params.messages[0]?.content ?? "";
        const note = /<note>([\s\S]*?)<\/note>/.exec(content)?.[1] ?? "";
        const marker = /(\d+)번째 안건/.exec(note)?.[1] ?? "?";
        return {
          statements: [
            {
              content: `${marker}번째 청크 진술`,
              type: "claim",
              confidence: "certain",
            },
          ],
        };
      },
    );
    const llm = {
      generateStructured,
      async *generateStream() {
        yield "";
      },
      generateText: vi.fn().mockResolvedValue(""),
    } as unknown as LlmProvider;

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    // 여러 콜로 갈렸고
    expect(generateStructured.mock.calls.length).toBeGreaterThan(1);
    // 청크 콜에는 읽기 전용 문맥이 동봉된다 (첫 청크 제외)
    const messages = generateStructured.mock.calls.map(
      (call) => call[0]?.messages[0]?.content ?? "",
    );
    expect(messages.some((m) => m.includes("<context_before>"))).toBe(true);
    expect(messages.some((m) => m.includes("<context_after>"))).toBe(true);

    // apply는 1회, 진술은 원문(청크) 순서 + 전역 index
    const applies = rpcCalls(rpc, "apply_ingestion_changeset");
    expect(applies).toHaveLength(1);
    const statements = (
      applies[0]?.[1] as {
        p_statements: Array<{ content: string; index: number }>;
      }
    ).p_statements;
    expect(statements.length).toBe(generateStructured.mock.calls.length);
    const markers = statements.map((s) =>
      Number(/(\d+)번째/.exec(s.content)?.[1]),
    );
    expect(markers).toEqual([...markers].sort((a, b) => a - b));
    expect(statements.map((s) => s.index)).toEqual(statements.map((_, i) => i));
  });

  it("장문 분할 — 청크 하나가 실패하면 부분 저장 없이 source 전체가 재시도 경로를 탄다", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[{ ...PENDING_SOURCE, body: longBody() }]],
    });

    let callCount = 0;
    const generateStructured = vi.fn(async () => {
      callCount += 1;
      if (callCount === 2) {
        // 결정적 실패 — 콜 레벨 재시도 없이 즉시 전파되는 코드
        throw new LlmError("bad_request", "schema mismatch");
      }
      return {
        statements: [{ content: "진술", type: "claim", confidence: "certain" }],
      };
    });
    const llm = {
      generateStructured,
      async *generateStream() {
        yield "";
      },
      generateText: vi.fn().mockResolvedValue(""),
    } as unknown as LlmProvider;

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(0);
    const retries = rpcCalls(rpc, "increment_source_extraction_retry");
    expect(retries).toHaveLength(1);
    expect(retries[0]?.[1]).toMatchObject({
      p_source_id: SOURCE_ID,
      p_error_message: expect.stringContaining("schema mismatch"),
    });
  });
});

// 게이트 — 엔진 판정의 척추 (relation-design §5). 잘못되면 충돌이 조용히 적용되거나
// 멀쩡한 관계가 사람 책상으로 새므로, 분기·dedup·scope를 직접 박는다.
describe("gateProposals", () => {
  const NEW_0 = "d0000000-0000-4000-a000-000000000001";
  const NEW_1 = "d0000000-0000-4000-a000-000000000002";
  const OLD_0 = "e0000000-0000-4000-a000-000000000001";
  const OLD_1 = "e0000000-0000-4000-a000-000000000002";

  const labelToId = new Map<string, string>([
    ["N0", NEW_0],
    ["N1", NEW_1],
    ["E0", OLD_0],
    ["E1", OLD_1],
  ]);
  const batchIds = new Set<string>([NEW_0, NEW_1]);

  const gate = (proposals: RelationProposal[]) =>
    gateProposals({ proposals, labelToId, batchIds });

  it("확신·비충돌은 applied — supports·replaces·resolves", () => {
    const { applied, pending } = gate([
      { from: "N0", to: "E0", type: "replaces", confident: true },
      { from: "E1", to: "N1", type: "supports", confident: true },
      { from: "N0", to: "E1", type: "resolves", confident: true },
    ]);
    expect(applied).toHaveLength(3);
    expect(pending).toHaveLength(0);
    expect(applied).toContainEqual({
      from_id: NEW_0,
      to_id: OLD_0,
      type: "replaces",
    });
  });

  it("충돌은 확신해도 pending", () => {
    const { applied, pending } = gate([
      { from: "N0", to: "E0", type: "conflicts", confident: true },
    ]);
    expect(applied).toHaveLength(0);
    expect(pending).toEqual([
      { from_id: NEW_0, to_id: OLD_0, type: "conflicts" },
    ]);
  });

  it("애매는 종류 무관 pending", () => {
    const { applied, pending } = gate([
      { from: "N0", to: "E0", type: "replaces", confident: false },
      { from: "E1", to: "N1", type: "supports", confident: false },
    ]);
    expect(applied).toHaveLength(0);
    expect(pending).toHaveLength(2);
  });

  it("모르는 라벨·자기 관계·기존↔기존은 버린다", () => {
    const { applied, pending } = gate([
      { from: "N0", to: "E9", type: "supports", confident: true }, // 모르는 라벨
      { from: "N0", to: "N0", type: "supports", confident: true }, // 자기 관계
      { from: "E0", to: "E1", type: "conflicts", confident: true }, // 기존↔기존
    ]);
    expect(applied).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it("conflicts는 역방향 중복을 collapse한다", () => {
    const { pending } = gate([
      { from: "N0", to: "E0", type: "conflicts", confident: true },
      { from: "E0", to: "N0", type: "conflicts", confident: false },
    ]);
    expect(pending).toHaveLength(1);
  });
});

// 후보 좁히기 — 형제 제외/skip 경계가 틀리면 LLM 판정 대상을 조용히 망친다.
describe("selectCandidateIds", () => {
  it("앵커별 이웃을 합치고 중복을 건다", () => {
    const ids = selectCandidateIds(
      [
        ["e1", "e2"],
        ["e2", "e3"],
      ],
      new Set(),
    );
    expect([...ids].sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("같은 배치(형제) id는 후보에서 뺀다 — 새 진술 목록이 이미 담으므로", () => {
    const ids = selectCandidateIds([["sibling", "e1"]], new Set(["sibling"]));
    expect(ids).toEqual(["e1"]);
  });

  it("이웃이 없으면 빈 배열", () => {
    expect(selectCandidateIds([[], []], new Set(["x"]))).toEqual([]);
  });
});

describe("canFormRelations", () => {
  it("후보가 있으면 진술 1개라도 LLM을 부른다", () => {
    expect(canFormRelations(1, 3)).toBe(true);
  });

  it("후보 0 + 새 진술 2개 이상이면 형제끼리 관계가 가능하다", () => {
    expect(canFormRelations(2, 0)).toBe(true);
  });

  it("후보 0 + 새 진술 1개면 비교 대상이 없어 생략한다", () => {
    expect(canFormRelations(1, 0)).toBe(false);
  });
});

// 잇기 콜 분할 — 장문 source가 sub-batch로 안전히 나뉘는지 (relation-design §11 후속)
describe("chunkStatements", () => {
  it("원문 순서 보존하며 size개씩 끊는다 (끝 청크는 잔여)", () => {
    expect(chunkStatements([0, 1, 2, 3, 4], 2)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("정확히 나눠떨어지면 균등 청크", () => {
    expect(chunkStatements([0, 1, 2, 3], 2)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("상한 이하면 한 청크 — 짧은 글은 기존 1콜 그대로", () => {
    expect(chunkStatements([0, 1], 30)).toEqual([[0, 1]]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(chunkStatements([], 30)).toEqual([]);
  });
});

describe("dedupeChanges", () => {
  const A = "a0000000-0000-4000-a000-000000000001";
  const B = "a0000000-0000-4000-a000-000000000002";

  it("같은 삼중쌍 중복을 하나로", () => {
    const out = dedupeChanges([
      { from_id: A, to_id: B, type: "supports" },
      { from_id: A, to_id: B, type: "supports" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("conflicts는 역방향(B→A)까지 collapse — 대칭", () => {
    const out = dedupeChanges([
      { from_id: A, to_id: B, type: "conflicts" },
      { from_id: B, to_id: A, type: "conflicts" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("종류·쌍이 다르면 보존", () => {
    const out = dedupeChanges([
      { from_id: A, to_id: B, type: "supports" },
      { from_id: A, to_id: B, type: "replaces" },
    ]);
    expect(out).toHaveLength(2);
  });
});

function mockRelationLlm(): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({ relations: [] }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn().mockResolvedValue(""),
  };
}

describe("잇기 분할 통합 — 장문 source", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("진술 35개(상한 30 초과)는 2 sub-batch로 판정되고 apply는 source당 1번", async () => {
    const statements = Array.from({ length: 35 }, (_, i) => ({
      id: `c0000000-0000-4000-a000-${String(i).padStart(12, "0")}`,
      content: `진술 ${i}`,
      type: "claim",
      confidence: "certain",
      ingestion_status: "completed",
      status: "active",
      statement_sources: [{ source_id: SOURCE_ID, locator: { index: i } }],
    }));
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_linking_sources: [
          [
            {
              id: SOURCE_ID,
              space_id: SPACE_ID,
              created_at: "2026-06-11T00:00:00.000Z",
            },
          ],
        ],
      },
      { statements },
    );
    const llm = mockRelationLlm();

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(), // searchNeighbors → [] (후보 없음)
    });

    // 35개 → 30 + 5 두 sub-batch → 판정 콜 2번
    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
    // 되돌리기 단위는 글 — K개 sub-batch여도 적용은 source당 1번
    expect(rpcCalls(rpc, "apply_relation_changesets")).toHaveLength(1);
  });
});

// 교차 dedup — sub-batch로 갈려 같은 쌍이 applied·pending 양쪽에 살아남는 걸 막는다
// (gateProposals의 XOR 불변식이 콜 단위라 깨지는 지점, applied 우선).
describe("reconcileChanges", () => {
  const A = "a0000000-0000-4000-a000-000000000001";
  const B = "a0000000-0000-4000-a000-000000000002";
  const C = "a0000000-0000-4000-a000-000000000003";

  it("같은 쌍이 applied·pending 양쪽이면 pending에서 빼고 applied만 남긴다", () => {
    const out = reconcileChanges(
      [{ from_id: A, to_id: B, type: "supports" }],
      [{ from_id: A, to_id: B, type: "supports" }],
    );
    expect(out.applied).toHaveLength(1);
    expect(out.pending).toHaveLength(0);
  });

  it("applied에 없는 pending은 보존한다", () => {
    const out = reconcileChanges(
      [{ from_id: A, to_id: B, type: "supports" }],
      [{ from_id: A, to_id: C, type: "conflicts" }],
    );
    expect(out.applied).toHaveLength(1);
    expect(out.pending).toHaveLength(1);
  });

  it("각 리스트 내부 중복도 함께 collapse한다", () => {
    const out = reconcileChanges(
      [
        { from_id: A, to_id: B, type: "supports" },
        { from_id: A, to_id: B, type: "supports" },
      ],
      [],
    );
    expect(out.applied).toHaveLength(1);
  });
});

// 원문 순서 정렬 — 핵심 변경인데 통합 테스트 입력이 이미 순서라 no-op이던 공백을 메운다.
describe("orderBySourceAppearance", () => {
  const row = (id: string, index: number | null) => ({
    id,
    statement_sources: [{ locator: index === null ? {} : { index } }],
  });

  it("셔플 입력을 locator.index 오름차순으로 정렬한다", () => {
    const ordered = orderBySourceAppearance([
      row("c", 2),
      row("a", 0),
      row("b", 1),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("locator index가 없는 행은 맨 뒤로 — 상류 불변식 위반 방어", () => {
    const ordered = orderBySourceAppearance([
      row("missing", null),
      row("first", 0),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["first", "missing"]);
  });
});
