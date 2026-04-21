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

// 트리거 맵 키: `${userId}:${docId}` — 그래프에서 반환된 docId를 userId와 쌍으로만
// 취급해 사용자 간 데이터 오염을 방어. apply_propagated_revision은 service_role로
// auth.uid() 검증을 우회하므로 application·DB 이중 격리가 필요.
type TriggerKey = `${string}:${string}`;

function triggerKey(userId: string, docId: string): TriggerKey {
  return `${userId}:${docId}`;
}

export async function runPropagation(
  processedItems: ProcessedItem[],
  deps: PropagationDeps,
): Promise<void> {
  const triggersByRelated = new Map<
    TriggerKey,
    { userId: string; docId: string; triggerBodies: string[] }
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
          const key = triggerKey(item.userId, r.docId);
          const existing = triggersByRelated.get(key);
          if (existing) {
            existing.triggerBodies.push(item.body);
          } else {
            triggersByRelated.set(key, {
              userId: item.userId,
              docId: r.docId,
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

  // userId별로 그룹핑해 per-user 쿼리 — DB 레벨 격리
  const idsByUser = new Map<string, Set<string>>();
  for (const { userId, docId } of triggersByRelated.values()) {
    const bucket = idsByUser.get(userId) ?? new Set<string>();
    bucket.add(docId);
    idsByUser.set(userId, bucket);
  }

  const memories: Array<{
    id: string;
    user_id: string;
    title: string | null;
    category: string | null;
    tags: string[] | null;
    summary: string | null;
    body: string;
  }> = [];
  const revisions: Array<{
    memory_id: string;
    history_id: string;
    created_at: string;
  }> = [];

  for (const [userId, docIdSet] of idsByUser) {
    const ids = [...docIdSet];
    const [memResult, revResult] = await Promise.all([
      deps.supabase
        .from("memories")
        .select("id, user_id, title, category, tags, summary, body")
        .eq("user_id", userId)
        .in("id", ids),
      deps.supabase
        .from("memory_revisions")
        .select("memory_id, history_id, created_at")
        .in("memory_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    if (memResult.error) {
      Sentry.captureMessage(
        `[propagation] memories fetch failed: ${memResult.error.message}`,
        { level: "error", extra: { error: memResult.error, userId } },
      );
      continue;
    }
    if (revResult.error) {
      Sentry.captureMessage(
        `[propagation] memory_revisions fetch failed: ${revResult.error.message}`,
        { level: "error", extra: { error: revResult.error, userId } },
      );
      continue;
    }

    memories.push(...(memResult.data ?? []));
    revisions.push(...(revResult.data ?? []));
  }

  const historyIdByMemory = new Map<string, string>();
  for (const r of revisions) {
    if (!historyIdByMemory.has(r.memory_id)) {
      historyIdByMemory.set(r.memory_id, r.history_id);
    }
  }

  await Promise.allSettled(
    memories.map(async (mem) => {
      const trigger = triggersByRelated.get(triggerKey(mem.user_id, mem.id));
      const historyId = historyIdByMemory.get(mem.id);

      if (!trigger || !historyId) {
        return;
      }

      let result;
      try {
        result = await deps.llm.generateStructured({
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
      } catch (err) {
        Sentry.captureException(err, {
          tags: { component: "propagation", phase: "llm" },
          extra: { memId: mem.id },
        });
        return;
      }

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
        Sentry.captureException(
          new Error(`apply_propagated_revision failed: ${error.message}`),
          {
            tags: { component: "propagation", phase: "rpc" },
            extra: { memId: mem.id, error },
          },
        );
      }
    }),
  );
}
