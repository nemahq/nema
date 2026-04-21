import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";

import type { ProcessedItem } from "./propagation";
import { runPropagation } from "./propagation";

const USER_ID = "b0000000-0000-4000-a000-000000000001";
const HISTORY_ID = "c0000000-0000-4000-a000-000000000001";
const DOC_A = "a0000000-0000-4000-a000-000000000001";
const DOC_B = "a0000000-0000-4000-a000-000000000002";
const DOC_C = "a0000000-0000-4000-a000-000000000003";
const DOC_D = "a0000000-0000-4000-a000-000000000004";

function mockGraphStore(related: Record<string, string[]>): GraphStore {
  return {
    findRelatedDocuments: vi
      .fn()
      .mockImplementation(({ docId }: { docId: string }) =>
        Promise.resolve(
          (related[docId] ?? []).map((id) => ({
            docId: id,
            sharedEntityCount: 1,
          })),
        ),
      ),
  } as unknown as GraphStore;
}

function mockLlm(): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({
      update_type: "replace",
      body: "updated body",
      tags: ["tag1"],
      summary: "updated summary",
    }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn(),
  };
}

function mockSupabase(memories: object[], revisions: object[]) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "memories") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: memories, error: null }),
      };
    }
    // memory_revisions
    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: revisions, error: null }),
    };
  });

  return { from, rpc } as unknown as ReturnType<
    typeof import("@supabase/supabase-js").createClient
  >;
}

describe("runPropagation", () => {
  describe("dedup / grouping", () => {
    it("두 processed item이 같은 related memory를 가리키면 한 번만 재합성하고 두 trigger body를 모두 전달한다", async () => {
      // A → [C], B → [C, D]
      const graphStore = mockGraphStore({
        [DOC_A]: [DOC_C],
        [DOC_B]: [DOC_C, DOC_D],
      });
      const llm = mockLlm();

      const memories = [
        {
          id: DOC_C,
          user_id: USER_ID,
          title: "C title",
          category: null,
          tags: ["c"],
          summary: "C summary",
          body: "C body",
        },
        {
          id: DOC_D,
          user_id: USER_ID,
          title: "D title",
          category: null,
          tags: ["d"],
          summary: "D summary",
          body: "D body",
        },
      ];
      const revisions = [
        {
          memory_id: DOC_C,
          history_id: HISTORY_ID,
          created_at: "2026-04-01T00:00:00.000Z",
        },
        {
          memory_id: DOC_D,
          history_id: HISTORY_ID,
          created_at: "2026-04-01T00:00:00.000Z",
        },
      ];
      const supabase = mockSupabase(memories, revisions);
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      const items: ProcessedItem[] = [
        {
          docId: DOC_A,
          userId: USER_ID,
          historyId: HISTORY_ID,
          body: "body A",
        },
        {
          docId: DOC_B,
          userId: USER_ID,
          historyId: HISTORY_ID,
          body: "body B",
        },
      ];

      await runPropagation(items, { supabase, llm, graphStore });

      // LLM 호출은 C, D 각각 한 번씩 — 총 2회
      expect(llm.generateStructured).toHaveBeenCalledTimes(2);

      // C 재합성: trigger body에 A와 B 둘 다 포함
      const llmCalls = (llm.generateStructured as ReturnType<typeof vi.fn>).mock
        .calls;
      const cCallIdx = llmCalls.findIndex(([params]) =>
        (params.messages[0].content as string).includes("C body"),
      );
      expect(cCallIdx).not.toBe(-1);
      const cContent: string = llmCalls[cCallIdx][0].messages[0].content;
      expect(cContent).toContain("body A");
      expect(cContent).toContain("body B");

      // apply_propagated_revision: C, D 각각 한 번씩
      expect(rpc).toHaveBeenCalledWith(
        "apply_propagated_revision",
        expect.objectContaining({ p_memory_id: DOC_C }),
      );
      expect(rpc).toHaveBeenCalledWith(
        "apply_propagated_revision",
        expect.objectContaining({ p_memory_id: DOC_D }),
      );
    });
  });
});
