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
  // Map 값의 historyId: 연쇄 revision이 "원래 저장 History"를 가리키게 하는 핵심.
  // NEM-26(시간축)·NEM-81(Lint)이 source='direct'로 필터하면서 propagated
  // revision도 같은 history_id를 공유해야 "저장 A가 유발한 전파 묶음" 조회가 성립.
  const triggersByRelated = new Map<
    TriggerKey,
    {
      userId: string;
      docId: string;
      historyId: string;
      triggerBodies: string[];
    }
  >();

  await Promise.allSettled(
    processedItems.map(async (item) => {
      if (item.historyId === null) {
        // 정상 경로에서는 발생하지 않음 (create_memory_with_revision이 memory와
        // revision을 동시 삽입). 방어선이지만 기록은 남긴다.
        Sentry.captureMessage(
          `[propagation] skipping trigger without historyId: ${item.docId}`,
          { level: "warning", extra: { docId: item.docId } },
        );
        return;
      }

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
              historyId: item.historyId,
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

  for (const [userId, docIdSet] of idsByUser) {
    const ids = [...docIdSet];
    const memResult = await deps.supabase
      .from("memories")
      .select("id, user_id, title, category, tags, summary, body")
      .eq("user_id", userId)
      .in("id", ids);

    if (memResult.error) {
      Sentry.captureMessage(
        `[propagation] memories fetch failed: ${memResult.error.message}`,
        { level: "error", extra: { error: memResult.error, userId } },
      );
      continue;
    }

    memories.push(...(memResult.data ?? []));
  }

  await Promise.allSettled(
    memories.map(async (mem) => {
      const trigger = triggersByRelated.get(triggerKey(mem.user_id, mem.id));
      if (!trigger) {
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
        p_history_id: trigger.historyId,
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
