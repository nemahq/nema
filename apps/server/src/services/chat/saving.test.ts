import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

import { handleSave } from "./saving";

const USER_ID = "u0000000-0000-4000-8000-000000000001";
const SESSION_ID = "s0000000-0000-4000-8000-000000000002";
const HISTORY_ID = "h0000000-0000-4000-8000-000000000003";
const MEMORY_ID = "m0000000-0000-4000-8000-000000000004";

function createChain(resolved: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolved));
  return chain;
}

function makeProviders(overrides?: {
  splitTopics?: string[];
  judgmentItems?: Array<Record<string, unknown>>;
  judgmentItemsByTopic?: Array<Array<Record<string, unknown>>>;
  metaResults?: Array<Record<string, unknown>>;
  searchResults?: Array<{ payload: { doc_id: string }; score: number }>;
}): Providers {
  const {
    splitTopics = ["topic-1"],
    judgmentItems,
    judgmentItemsByTopic,
    metaResults = [
      {
        title: "기본 제목",
        category: null,
        tags: ["tag-1"],
        summary: "요약",
      },
    ],
    searchResults = [],
  } = overrides ?? {};

  const mini = { generateStructured: vi.fn() };
  const standard = { generateStructured: vi.fn() };

  // split call (first mini invocation)
  mini.generateStructured.mockResolvedValueOnce({ topics: splitTopics });

  // judgment calls — topicIndex별로 매핑 (by topic) 또는 평면 배열 (fallback)
  if (judgmentItemsByTopic) {
    judgmentItemsByTopic.forEach((items) =>
      standard.generateStructured.mockResolvedValueOnce({ items }),
    );
  } else if (judgmentItems) {
    standard.generateStructured.mockResolvedValueOnce({ items: judgmentItems });
  } else {
    standard.generateStructured.mockResolvedValueOnce({
      items: [
        {
          update_type: "create",
          target_id: null,
          final_body: "새 내용",
        },
      ],
    });
  }

  // meta calls — 순서대로 소비
  metaResults.forEach((meta) =>
    mini.generateStructured.mockResolvedValueOnce(meta),
  );

  return {
    llm: {
      mini: mini as unknown as Providers["llm"]["mini"],
      standard: standard as unknown as Providers["llm"]["standard"],
      nano: mini as unknown as Providers["llm"]["nano"],
    },
    embedding: {} as Providers["embedding"],
    vectorStore: {
      search: vi.fn().mockResolvedValue(searchResults),
    } as unknown as Providers["vectorStore"],
    entityVectorStore: {} as Providers["entityVectorStore"],
    graphStore: {} as Providers["graphStore"],
  };
}

function makeSupabase(opts: {
  historiesInsertError?: unknown;
  memoriesFetchError?: unknown;
  applyError?: unknown;
  applyTitles?: string[];
  memoriesFetchData?: Array<{ id: string; body: string }>;
}): { supabase: TypedSupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name === "apply_save_pipeline") {
      return Promise.resolve({
        data: opts.applyError ? null : (opts.applyTitles ?? []),
        error: opts.applyError ?? null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const from = vi.fn((table: string) => {
    if (table === "memories") {
      return createChain({
        data: opts.memoriesFetchData ?? [],
        error: opts.memoriesFetchError ?? null,
      });
    }
    if (table === "histories") {
      return createChain({
        data: opts.historiesInsertError ? null : { id: HISTORY_ID },
        error: opts.historiesInsertError ?? null,
      });
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { supabase: { from, rpc } as unknown as TypedSupabaseClient, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSave", () => {
  it("단일 토픽 + 유사 Memory 없음 → 단일 apply_save_pipeline RPC 호출", async () => {
    const providers = makeProviders();
    const { supabase, rpc } = makeSupabase({ applyTitles: ["기본 제목"] });

    const result = await handleSave({
      supabase,
      providers,
      userId: USER_ID,
      sessionId: SESSION_ID,
      draftBody: "토스로 이직했다",
      contentLanguage: "ko",
    });

    expect(result.historyId).toBe(HISTORY_ID);
    expect(result.titles).toEqual(["기본 제목"]);
    expect(rpc).toHaveBeenCalledWith("apply_save_pipeline", {
      p_user_id: USER_ID,
      p_history_id: HISTORY_ID,
      p_items: [
        expect.objectContaining({
          update_type: "create",
          target_id: null,
          title: "기본 제목",
          body: "새 내용",
        }),
      ],
    });
  });

  it("Fan-out: 2토픽/2아이템이 apply_save_pipeline 단일 호출로 묶임 (원자성)", async () => {
    const providers = makeProviders({
      splitTopics: ["topic-A", "topic-B"],
      judgmentItemsByTopic: [
        [
          {
            update_type: "create",
            target_id: null,
            final_body: "A 내용",
          },
        ],
        [
          {
            update_type: "replace",
            target_id: MEMORY_ID,
            final_body: "B 내용",
          },
        ],
      ],
      metaResults: [
        { title: "A 제목", category: null, tags: [], summary: "A" },
        { title: "B 제목", category: null, tags: [], summary: "B" },
      ],
    });
    const { supabase, rpc } = makeSupabase({
      applyTitles: ["A 제목", "B 제목"],
    });

    const result = await handleSave({
      supabase,
      providers,
      userId: USER_ID,
      sessionId: SESSION_ID,
      draftBody: "여러 주제가 섞인 draft",
      contentLanguage: "ko",
    });

    expect(result.titles).toEqual(["A 제목", "B 제목"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "apply_save_pipeline",
      expect.objectContaining({
        p_items: [
          expect.objectContaining({ update_type: "create", body: "A 내용" }),
          expect.objectContaining({
            update_type: "replace",
            target_id: MEMORY_ID,
            body: "B 내용",
          }),
        ],
      }),
    );
  });

  it("apply_save_pipeline이 RPC 에러 반환 시 SupabaseError 전파 (DB 트랜잭션 롤백 기대)", async () => {
    const providers = makeProviders();
    const { supabase } = makeSupabase({
      applyError: { message: "target_id required", code: "P0001" },
    });

    await expect(
      handleSave({
        supabase,
        providers,
        userId: USER_ID,
        sessionId: SESSION_ID,
        draftBody: "draft",
        contentLanguage: "ko",
      }),
    ).rejects.toThrow(/target_id required/);
  });

  it("histories insert 실패 시 SupabaseError 전파 (job failed로 귀결)", async () => {
    const providers = makeProviders();
    const { supabase } = makeSupabase({
      historiesInsertError: { message: "duplicate key", code: "23505" },
    });

    await expect(
      handleSave({
        supabase,
        providers,
        userId: USER_ID,
        sessionId: SESSION_ID,
        draftBody: "draft",
        contentLanguage: "ko",
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});
