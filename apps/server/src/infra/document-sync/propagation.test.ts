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
const TRIGGER_HISTORY = "c0000000-0000-4000-a000-000000000001";
const STALE_HISTORY = "c0000000-0000-4000-a000-0000000000ff";
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

function mockSupabase(memories: object[]) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const from = vi.fn().mockImplementation(() => {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
        const filtered = (memories as Array<{ id: string }>).filter((m) =>
          ids.includes(m.id),
        );
        return Promise.resolve({ data: filtered, error: null });
      }),
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
      const supabase = mockSupabase(memories);
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      const items: ProcessedItem[] = [
        {
          docId: DOC_A,
          userId: USER_ID,
          historyId: TRIGGER_HISTORY,
          body: "body A",
        },
        {
          docId: DOC_B,
          userId: USER_ID,
          historyId: TRIGGER_HISTORY,
          body: "body B",
        },
      ];

      await runPropagation(items, { supabase, llm, graphStore });

      expect(llm.generateStructured).toHaveBeenCalledTimes(2);

      const llmCalls = (llm.generateStructured as ReturnType<typeof vi.fn>).mock
        .calls;
      const cCallIdx = llmCalls.findIndex(([params]) =>
        (params.messages[0].content as string).includes("C body"),
      );
      expect(cCallIdx).not.toBe(-1);
      const cContent: string = llmCalls[cCallIdx][0].messages[0].content;
      expect(cContent).toContain("body A");
      expect(cContent).toContain("body B");

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

  describe("history_id 연결", () => {
    it("propagated revision은 트리거된 processed item의 historyId를 사용한다 (연관 memory의 과거 historyId가 아님)", async () => {
      const graphStore = mockGraphStore({ [DOC_A]: [DOC_C] });
      const llm = mockLlm();

      // C는 과거에 다른 저장(STALE_HISTORY)으로 만들어진 memory
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
      ];
      const supabase = mockSupabase(memories);
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      // A가 이번 저장(TRIGGER_HISTORY)으로 들어와 C를 트리거
      const items: ProcessedItem[] = [
        {
          docId: DOC_A,
          userId: USER_ID,
          historyId: TRIGGER_HISTORY,
          body: "body A",
        },
      ];

      await runPropagation(items, { supabase, llm, graphStore });

      expect(rpc).toHaveBeenCalledWith(
        "apply_propagated_revision",
        expect.objectContaining({
          p_memory_id: DOC_C,
          p_history_id: TRIGGER_HISTORY,
        }),
      );
      // 연관 memory의 과거 historyId는 사용되면 안 됨
      expect(rpc).not.toHaveBeenCalledWith(
        "apply_propagated_revision",
        expect.objectContaining({ p_history_id: STALE_HISTORY }),
      );
    });

    it("historyId가 null인 trigger는 skip한다", async () => {
      const graphStore = mockGraphStore({ [DOC_A]: [DOC_C] });
      const llm = mockLlm();
      const supabase = mockSupabase([
        {
          id: DOC_C,
          user_id: USER_ID,
          title: "C",
          category: null,
          tags: [],
          summary: "",
          body: "C body",
        },
      ]);
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      const items: ProcessedItem[] = [
        {
          docId: DOC_A,
          userId: USER_ID,
          historyId: null,
          body: "body A",
        },
      ];

      await runPropagation(items, { supabase, llm, graphStore });

      expect(llm.generateStructured).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
