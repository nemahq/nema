import * as Sentry from "@sentry/node";

import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  buildResynthesisMessage,
  RESYNTHESIS_SYSTEM_PROMPT,
  ResynthesisOutputSchema,
} from "@server/prompts/memory-resynthesis";

export interface ProcessedItem {
  docId: string;
  userId: string;
  historyId: string | null;
  body: string;
}

interface PropagationDeps {
  supabase: TypedSupabaseClient;
  llm: LlmProvider;
  graphStore: GraphStore;
}

const RELATED_DOC_LIMIT = 10;

export async function runPropagation(
  processedItems: ProcessedItem[],
  deps: PropagationDeps,
): Promise<void> {
  const triggersByRelated = new Map<
    string,
    { userId: string; triggerBodies: string[] }
  >();

  await Promise.allSettled(
    processedItems.map(async (item) => {
      try {
        const related = await deps.graphStore.findRelatedDocuments({
          docId: item.docId,
          userId: item.userId,
          depth: 1,
          limit: RELATED_DOC_LIMIT,
        });

        for (const r of related) {
          const existing = triggersByRelated.get(r.docId);
          if (existing) {
            existing.triggerBodies.push(item.body);
          } else {
            triggersByRelated.set(r.docId, {
              userId: item.userId,
              triggerBodies: [item.body],
            });
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { component: "propagation", phase: "findRelated" },
          extra: { docId: item.docId },
        });
      }
    }),
  );

  if (triggersByRelated.size === 0) {
    return;
  }

  const relatedIds = [...triggersByRelated.keys()];

  const [memoriesResult, revisionsResult] = await Promise.all([
    deps.supabase
      .from("memories")
      .select("id, user_id, title, category, tags, summary, body")
      .in("id", relatedIds),
    deps.supabase
      .from("memory_revisions")
      .select("memory_id, history_id, created_at")
      .in("memory_id", relatedIds)
      .order("created_at", { ascending: false }),
  ]);

  if (memoriesResult.error) {
    Sentry.captureMessage(
      `[propagation] memories fetch failed: ${memoriesResult.error.message}`,
      { level: "error", extra: { error: memoriesResult.error } },
    );
    return;
  }

  const historyIdByMemory = new Map<string, string>();
  for (const r of revisionsResult.data ?? []) {
    if (!historyIdByMemory.has(r.memory_id)) {
      historyIdByMemory.set(r.memory_id, r.history_id);
    }
  }

  await Promise.allSettled(
    (memoriesResult.data ?? []).map(async (mem) => {
      const trigger = triggersByRelated.get(mem.id);
      const historyId = historyIdByMemory.get(mem.id);

      if (!trigger || !historyId) {
        return;
      }

      try {
        const result = await deps.llm.generateStructured({
          schema: ResynthesisOutputSchema,
          schemaName: "memory_resynthesis",
          systemPrompt: RESYNTHESIS_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildResynthesisMessage(
                { body: mem.body },
                trigger.triggerBodies.map((b) => ({ body: b })),
              ),
            },
          ],
        });

        const { error } = await deps.supabase.rpc("apply_propagated_revision", {
          p_memory_id: mem.id,
          p_user_id: mem.user_id,
          p_history_id: historyId,
          p_title: mem.title ?? "",
          p_category: mem.category ?? null,
          p_tags: result.tags,
          p_summary: result.summary,
          p_body: result.body,
          p_update_type: result.update_type,
        });

        if (error) {
          throw new Error(`apply_propagated_revision failed: ${error.message}`);
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { component: "propagation", phase: "resynthesize" },
          extra: { memId: mem.id },
        });
      }
    }),
  );
}
