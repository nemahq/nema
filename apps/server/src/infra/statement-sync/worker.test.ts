import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { VectorStore } from "@server/infra/vector";
import type { RelationProposal } from "@server/prompts/relation-judgment";

import type { PendingSource, PendingStatement, SourceDigest } from "./types";
import {
  canFormRelations,
  checkPurgeBacklog,
  chunkStatements,
  createStatementSyncWorker,
  deadlineContext,
  dedupeChanges,
  gateProposals,
  orderBySourceAppearance,
  POLL_INTERVAL_MS,
  reconcileChanges,
  runVectorPurgePass,
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
  author_timezone: "Asia/Seoul",
};

const DIGEST_ID_1 = "f0000000-0000-4000-a000-000000000001";
const DIGEST_ID_2 = "f0000000-0000-4000-a000-000000000002";

// 추출 입력 = 원문의 확정 Digest. 대부분의 추출 테스트는 digest 1개로 충분하다.
const DIGEST: SourceDigest = {
  id: DIGEST_ID_1,
  title: "배포 도구 선정",
  description: "배포 도구를 A로 정함",
  body: { type: "decision", choice: "배포 도구는 A로 정함" },
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
  for (const method of ["select", "eq", "in", "lt", "order"]) {
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
  // 워커는 task 라우터(forTask)를 받는다 — 테스트는 두 task 모두 같은 mock으로 해석.
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

  it("추출 성공 — digest에서 뽑은 진술에 digest_id·원문 관통 index를 실어 apply_extraction_statements 호출", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST] },
    );
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

    const applies = rpcCalls(rpc, "apply_extraction_statements");
    expect(applies).toHaveLength(1);
    expect(applies[0][1]).toEqual({
      p_source_id: SOURCE_ID,
      p_digest_ids: [DIGEST_ID_1],
      p_statements: [
        {
          content: "확정 결정.",
          type: "claim",
          confidence: "certain",
          due_date: null,
          digest_id: DIGEST_ID_1,
          index: 0,
        },
        {
          content: "확신도 빠진 추정.",
          type: "claim",
          confidence: "guess",
          due_date: null,
          digest_id: DIGEST_ID_1,
          index: 1,
        },
        {
          content: "할 일.",
          type: "todo",
          confidence: null,
          due_date: null,
          digest_id: DIGEST_ID_1,
          index: 2,
        },
      ],
    });
    // 메시지는 ack됐다
    expect(rpcCalls(rpc, "ack_sync_event")).toHaveLength(1);
  });

  it("내용 속 기한을 작성 시점·존 기준 due_date로 풀어 apply에 싣는다", async () => {
    // PENDING_SOURCE = 서울, created_at 2026-06-11(목). 이번 주 금요일 = 06-12.
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST] },
    );
    const llm = mockLlm([
      {
        content: "금요일까지 보고서 끝내기",
        type: "todo",
        confidence: null,
        deadline: {
          boundary: "by",
          anchorKind: "weekday",
          grain: null,
          offset: null,
          weekday: "fri",
          scope: "this",
          date: null,
        },
      },
    ]);

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    const applies = rpcCalls(rpc, "apply_extraction_statements");
    expect(applies[0][1].p_statements[0].due_date).toBe("2026-06-12");
  });

  it("진술 0개(판단 안 나온 Digest) — 빈 apply로 digest·source만 완료 표시", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST] },
    );

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    // 진술은 없어도 처리한 digest를 완료 표시해야 재추출 루프에 안 갇힌다
    const applies = rpcCalls(rpc, "apply_extraction_statements");
    expect(applies).toHaveLength(1);
    expect(applies[0][1]).toEqual({
      p_source_id: SOURCE_ID,
      p_digest_ids: [DIGEST_ID_1],
      p_statements: [],
    });
  });

  it("추출 LLM 실패 — increment_source_extraction_retry에 에러 메시지 기록", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST] },
    );
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
    expect(rpcCalls(rpc, "apply_extraction_statements")).toHaveLength(0);
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
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
        fetch_pending_statements: [[], [pendingStatement({})]],
      },
      { digests: [DIGEST] },
    );
    const vectorStore = mockVectorStore();

    await runOnePoll({
      supabase: client,
      llm: mockLlm([
        { content: "결정.", type: "claim", confidence: "certain" },
      ]),
      embedding: mockEmbedding(),
      vectorStore,
    });

    expect(rpcCalls(rpc, "apply_extraction_statements")).toHaveLength(1);
    expect(vectorStore.upsertStatements).toHaveBeenCalledTimes(1);

    // 순서: apply가 upsert보다 먼저
    const applyOrder =
      rpc.mock.invocationCallOrder[
        rpc.mock.calls.findIndex(([n]) => n === "apply_extraction_statements")
      ];
    const upsertOrder = (
      vectorStore.upsertStatements as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    expect(applyOrder).toBeLessThan(upsertOrder);
  });

  // --- 여러 Digest 순회 (Digest 1개당 LLM 1콜) ---

  const LEARNING_DIGEST: SourceDigest = {
    id: DIGEST_ID_2,
    title: "캐시 불일치 회고",
    description: "캐시 무효화 정책 학습",
    body: { type: "learning", finding: "캐시 불일치가 세 건 있었다" },
  };

  it("여러 Digest — 각 digest 진술이 digest_id와 원문 관통 index로 한 apply에 모인다", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST, LEARNING_DIGEST] },
    );

    // digest body 유형으로 어느 digest 콜인지 구분해 진술을 돌려준다 —
    // digest_id 태깅·원문 관통 index가 digest 경계를 넘어 이어지는지 검증
    const generateStructured = vi.fn(
      async (params: { messages: Array<{ content: string }> }) => {
        const content = params.messages[0]?.content ?? "";
        const isLearning = content.includes("type: learning");
        return {
          statements: [
            {
              content: isLearning ? "학습 진술" : "결정 진술",
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

    // Digest당 1콜
    expect(generateStructured).toHaveBeenCalledTimes(2);

    const applies = rpcCalls(rpc, "apply_extraction_statements");
    expect(applies).toHaveLength(1);
    expect(applies[0][1].p_statements).toEqual([
      {
        content: "결정 진술",
        type: "claim",
        confidence: "certain",
        due_date: null,
        digest_id: DIGEST_ID_1,
        index: 0,
      },
      {
        content: "학습 진술",
        type: "claim",
        confidence: "certain",
        due_date: null,
        digest_id: DIGEST_ID_2,
        index: 1,
      },
    ]);
  });

  it("digest 콜 하나가 실패하면 부분 저장 없이 source 전체가 재시도 경로를 탄다", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST, LEARNING_DIGEST] },
    );

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

    expect(rpcCalls(rpc, "apply_extraction_statements")).toHaveLength(0);
    const retries = rpcCalls(rpc, "increment_source_extraction_retry");
    expect(retries).toHaveLength(1);
    expect(retries[0]?.[1]).toMatchObject({
      p_source_id: SOURCE_ID,
      p_error_message: expect.stringContaining("schema mismatch"),
      // 결정적 실패라 나머지 재시도 예산을 안 태우고 1회 만에 failed로 종결한다.
      p_max_retries: 1,
    });
  });

  it("중간 Digest가 진술 0개여도 원문 관통 index는 연속이다", async () => {
    const IDEA_DIGEST: SourceDigest = {
      id: "f0000000-0000-4000-a000-000000000003",
      title: "아이디어",
      description: "d",
      body: { type: "idea", concept: "c" },
    };
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST, LEARNING_DIGEST, IDEA_DIGEST] },
    );

    // 첫째(decision)·셋째(idea)는 1개, 둘째(learning)는 0개
    const generateStructured = vi.fn(
      async (params: { messages: Array<{ content: string }> }) => {
        const content = params.messages[0]?.content ?? "";
        if (content.includes("type: learning")) {
          return { statements: [] };
        }
        const isIdea = content.includes("type: idea");
        return {
          statements: [
            {
              content: isIdea ? "아이디어 진술" : "결정 진술",
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

    const statements = rpcCalls(rpc, "apply_extraction_statements")[0][1]
      .p_statements as Array<{ digest_id: string; index: number }>;
    // 둘째 digest가 비어도 index는 digest 위치가 아니라 누적 진술 수 기준으로 연속
    expect(statements.map((s) => s.index)).toEqual([0, 1]);
    expect(statements.map((s) => s.digest_id)).toEqual([
      DIGEST_ID_1,
      IDEA_DIGEST.id,
    ]);
  });

  it("active Digest 0개 — LLM 콜 없이 완료 + 이상 신호 브레드크럼", async () => {
    const { client, rpc } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [] },
    );
    const llm = mockLlm([
      { content: "안 불림", type: "claim", confidence: "certain" },
    ]);

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    expect(llm.generateStructured).not.toHaveBeenCalled();
    // digest가 0개여도 빈 apply로 source 클레임을 완료 표시해 재시도에 안 갇히게 한다
    const applies = rpcCalls(rpc, "apply_extraction_statements");
    expect(applies).toHaveLength(1);
    expect(applies[0][1]).toEqual({
      p_source_id: SOURCE_ID,
      p_digest_ids: [],
      p_statements: [],
    });
    // pending 추출인데 pending digest가 0개인 건 상류 이상 — 무신호로 넘기지 않는다
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "source pending extraction has no pending digests",
      expect.objectContaining({ level: "warning" }),
    );
  });
});

// task 이름 계약 — 워커가 forTask에 넘기는 문자열이 라우팅 표(TASK_DEFAULTS)와 어긋나면
// effort 바인딩이 안 붙어 추출/판정이 full-reasoning 비용으로 조용히 돈다. 명시 인자를
// 뗀 지금 이 호출 문자열이 유일한 안전망이라 못박는다.
describe("createStatementSyncWorker — forTask task names", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('추출 경로는 forTask를 정확히 "extractStatements"로 부른다', async () => {
    const { client } = mockSupabase(
      {
        read_sync_events: [[NOTIFY_ROW]],
        fetch_pending_sources: [[PENDING_SOURCE]],
      },
      { digests: [DIGEST] },
    );
    const llm = mockLlm([
      { content: "한 문장.", type: "claim", confidence: "certain" },
    ]);
    const forTask = vi.fn(() => llm);

    const worker = createStatementSyncWorker({
      supabase: client,
      forTask,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });
    worker.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await worker.stop();

    expect(forTask).toHaveBeenCalledWith("extractStatements");
    // 옛 이름("extraction")으로 드리프트하면 여기서 잡힌다.
    expect(forTask).not.toHaveBeenCalledWith("extraction");
  });

  it('관계 판정 경로는 forTask를 정확히 "judgeRelations"로 부른다', async () => {
    const statements = Array.from({ length: 3 }, (_, i) => ({
      id: `c0000000-0000-4000-a000-${String(i).padStart(12, "0")}`,
      content: `진술 ${i}`,
      type: "claim",
      confidence: "certain",
      ingestion_status: "completed",
      status: "active",
      statement_sources: [{ source_id: SOURCE_ID, locator: { index: i } }],
    }));
    const { client } = mockSupabase(
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
    const forTask = vi.fn(() => llm);

    const worker = createStatementSyncWorker({
      supabase: client,
      forTask,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });
    worker.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await worker.stop();

    expect(forTask).toHaveBeenCalledWith("judgeRelations");
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

  it("같음은 확신해도 pending — from=keeper/to=duplicate 방향 유지", () => {
    const { applied, pending } = gate([
      { from: "E0", to: "N0", type: "duplicates", confident: true },
    ]);
    expect(applied).toHaveLength(0);
    expect(pending).toEqual([
      { from_id: OLD_0, to_id: NEW_0, type: "duplicates" },
    ]);
  });

  it("같음은 가릴 쪽(to)이 기존이면 버린다 — 새 글 투입으로 옛 기록을 안 지운다", () => {
    const { applied, pending } = gate([
      { from: "N0", to: "E0", type: "duplicates", confident: true },
    ]);
    expect(applied).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it("같음은 둘 다 새 진술이면 가릴 쪽(to)이 새 진술이라 pending으로 남는다", () => {
    const { pending } = gate([
      { from: "N1", to: "N0", type: "duplicates", confident: false },
    ]);
    expect(pending).toEqual([
      { from_id: NEW_1, to_id: NEW_0, type: "duplicates" },
    ]);
  });

  it("같음도 역방향 중복을 collapse한다 — 대칭쌍이 한 pending으로", () => {
    const { pending } = gate([
      { from: "N0", to: "N1", type: "duplicates", confident: true },
      { from: "N1", to: "N0", type: "duplicates", confident: false },
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

  it("판정의 duplicates가 apply의 p_pending으로 흘러간다 — from=keeper/to=duplicate 관계", async () => {
    const keeper = {
      id: "c0000000-0000-4000-a000-000000000000",
      content: "N잡으로 확정",
      type: "claim",
      confidence: "certain",
      ingestion_status: "completed",
      status: "active",
      statement_sources: [{ source_id: SOURCE_ID, locator: { index: 0 } }],
    };
    const dup = {
      id: "c0000000-0000-4000-a000-000000000001",
      content: "N잡으로 정함",
      type: "claim",
      confidence: "certain",
      ingestion_status: "completed",
      status: "active",
      statement_sources: [{ source_id: SOURCE_ID, locator: { index: 1 } }],
    };
    const statements = [keeper, dup];
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
    // 두 번째 진술(N1)이 첫 진술(N0)의 재진술 — from=keeper(N0)/to=duplicate(N1).
    // 확신해도 항상 pending으로 흘러 사람 검토를 거친다.
    const llm: LlmProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        relations: [
          { from: "N0", to: "N1", type: "duplicates", confident: true },
        ],
      }),
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

    const calls = rpcCalls(rpc, "apply_relation_changesets");
    expect(calls).toHaveLength(1);
    const args = calls[0]?.[1] as {
      p_applied: { from_id: string; to_id: string; type: string }[];
      p_pending: { from_id: string; to_id: string; type: string }[];
    };
    expect(args.p_applied).toEqual([]);
    expect(args.p_pending).toEqual([
      { from_id: keeper.id, to_id: dup.id, type: "duplicates" },
    ]);
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

describe("deadlineContext", () => {
  it("유효한 작성자 존을 그대로 쓰고 작성일을 그 존 기준으로 낸다", () => {
    // PENDING_SOURCE = 서울, created_at 2026-06-11T00:00Z → 서울 09:00.
    const ctx = deadlineContext(PENDING_SOURCE);
    expect(ctx.timeZone).toBe("Asia/Seoul");
    expect(ctx.todayIsoDate).toBe("2026-06-11");
  });

  it("무효한 존은 UTC로 강등", () => {
    const ctx = deadlineContext({
      ...PENDING_SOURCE,
      author_timezone: "Not/AZone",
    });
    expect(ctx.timeZone).toBe("UTC");
  });

  it("존이 없으면(옛 글·미전달) UTC로 강등", () => {
    const ctx = deadlineContext({ ...PENDING_SOURCE, author_timezone: null });
    expect(ctx.timeZone).toBe("UTC");
  });
});

describe("runVectorPurgePass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  type PurgeDeps = Parameters<typeof runVectorPurgePass>[0];

  // read는 배치 크기 미만(1건)만 돌려줘 한 번 읽고 드레인을 끝낸다.
  function makeDeps(deleteImpl: () => Promise<void>): {
    deps: PurgeDeps;
    rpc: ReturnType<typeof vi.fn>;
    deleteStatements: ReturnType<typeof vi.fn>;
  } {
    const deleteStatements = vi.fn(deleteImpl);
    const rpc = vi.fn((name: string) =>
      name === "read_vector_purge_events"
        ? Promise.resolve({
            data: [
              {
                msg_id: 42,
                message: { statement_ids: [STMT_ID_1, STMT_ID_2] },
              },
            ],
            error: null,
          })
        : Promise.resolve({ error: null }),
    );
    const deps = {
      supabase: { rpc },
      vectorStore: { deleteStatements },
    } as unknown as PurgeDeps;
    return { deps, rpc, deleteStatements };
  }

  it("성공하면 벡터를 지우고 메시지를 ack한다", async () => {
    const { deps, rpc, deleteStatements } = makeDeps(() => Promise.resolve());

    const processed = await runVectorPurgePass(deps);

    expect(processed).toBe(1);
    expect(deleteStatements).toHaveBeenCalledWith([STMT_ID_1, STMT_ID_2]);
    expect(rpc).toHaveBeenCalledWith("ack_vector_purge_event", {
      p_msg_id: 42,
    });
  });

  it("Qdrant 삭제가 실패하면 ack하지 않아 재전달로 재시도된다", async () => {
    const { deps, rpc, deleteStatements } = makeDeps(() =>
      Promise.reject(new Error("qdrant down")),
    );

    const processed = await runVectorPurgePass(deps);

    expect(processed).toBe(0);
    expect(deleteStatements).toHaveBeenCalledWith([STMT_ID_1, STMT_ID_2]);
    // ack 금지 — 안 그러면 실패한 벡터 삭제가 조용히 유실돼 죽은 원문 임베딩이 남는다.
    expect(rpc).not.toHaveBeenCalledWith(
      "ack_vector_purge_event",
      expect.anything(),
    );
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe("checkPurgeBacklog (purge 워치독)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  type WatchdogDeps = Parameters<typeof checkPurgeBacklog>[0];

  // rpc(purge_job_last_success) → lastSuccess, from(sources) count 조회 → overdueCount
  function watchdogDeps(params: {
    lastSuccess: string | null;
    overdueCount: number;
  }): WatchdogDeps {
    const rpc = vi.fn((name: string) =>
      name === "purge_job_last_success"
        ? Promise.resolve({ data: params.lastSuccess, error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "lt"]) {
      chain[method] = () => chain;
    }
    chain["then"] = (
      resolve: (value: { count: number; error: null }) => void,
    ) => resolve({ count: params.overdueCount, error: null });
    const from = vi.fn(() => chain);
    return { supabase: { rpc, from } } as unknown as WatchdogDeps;
  }

  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it("잡이 최근 성공했으면 만료 원문이 남아도 경고하지 않는다", async () => {
    await checkPurgeBacklog(
      watchdogDeps({ lastSuccess: hoursAgo(1), overdueCount: 999 }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("잡이 오래 안 돌았고 만료 원문이 있으면 경고한다", async () => {
    await checkPurgeBacklog(
      watchdogDeps({ lastSuccess: hoursAgo(48), overdueCount: 5 }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("purge stalled"),
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("잡이 오래 안 돌았어도 만료 원문이 없으면 조용하다(빈 DB·신규 배포)", async () => {
    await checkPurgeBacklog(
      watchdogDeps({ lastSuccess: null, overdueCount: 0 }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
