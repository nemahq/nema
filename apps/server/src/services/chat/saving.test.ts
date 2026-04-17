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
  rpcError?: unknown;
  memoriesFetchData?: Array<{ id: string; body: string }>;
}): { supabase: TypedSupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: MEMORY_ID, error: opts.rpcError ?? null });

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
  it("단일 토픽 + 유사 Memory 없음 → create 1건, titles 반환", async () => {
    const providers = makeProviders();
    const { supabase, rpc } = makeSupabase({});

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
    expect(rpc).toHaveBeenCalledWith(
      "create_memory_with_revision",
      expect.objectContaining({
        p_user_id: USER_ID,
        p_history_id: HISTORY_ID,
        p_title: "기본 제목",
        p_body: "새 내용",
      }),
    );
  });

  it("Fan-out: 2토픽 각각이 judgment item을 반환 → persist가 각 아이템마다 호출", async () => {
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
    const { supabase, rpc } = makeSupabase({});

    const result = await handleSave({
      supabase,
      providers,
      userId: USER_ID,
      sessionId: SESSION_ID,
      draftBody: "여러 주제가 섞인 draft",
      contentLanguage: "ko",
    });

    expect(result.titles).toEqual(["A 제목", "B 제목"]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "create_memory_with_revision",
      expect.objectContaining({ p_body: "A 내용" }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "update_memory_with_revision",
      expect.objectContaining({
        p_memory_id: MEMORY_ID,
        p_update_type: "replace",
        p_body: "B 내용",
      }),
    );
  });

  it("update_type=replace에 target_id가 null이면 throw (LLM 오동작 가드)", async () => {
    const providers = makeProviders({
      judgmentItems: [
        {
          update_type: "replace",
          target_id: null,
          final_body: "잘못된 출력",
        },
      ],
    });
    const { supabase } = makeSupabase({});

    await expect(
      handleSave({
        supabase,
        providers,
        userId: USER_ID,
        sessionId: SESSION_ID,
        draftBody: "draft",
        contentLanguage: "ko",
      }),
    ).rejects.toThrow(/requires non-null target_id/);
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
