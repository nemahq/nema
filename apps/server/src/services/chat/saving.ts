import { z } from "zod";

import type { ContentLanguage } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildJudgmentMessage,
  buildMetaMessage,
  buildSplitMessage,
  DERIVATION_META_SYSTEM_PROMPT,
  JUDGMENT_SYSTEM_PROMPT,
  META_SYSTEM_PROMPT,
  SPLIT_SYSTEM_PROMPT,
} from "@server/prompts/saving";
import { trackEvent } from "@server/services/event-service";

const SIMILAR_DOC_SEARCH_LIMIT = 5;

const SplitOutputSchema = z.object({
  documents: z.array(z.object({ body: z.string().min(1) })).min(1),
});

const JudgmentOutputSchema = z
  .object({
    action: z.enum(["create", "update"]),
    target_id: z.string().nullable(),
    final_body: z.string().min(1),
  })
  .refine(
    (d) =>
      d.action !== "update" || (d.target_id !== null && d.target_id.length > 0),
    { message: "target_id required for update" },
  );

const MetaOutputSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

const DerivationMetaOutputSchema = z.object({
  body_en: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
  title_en: z.string().min(1),
  tags_en: z.array(z.string().min(1)),
  summary_en: z.string().min(1),
});

type PersistAction =
  | { action: "create" }
  | { action: "update"; targetId: string };

interface ServiceContext {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  contentLanguage: ContentLanguage;
}

async function getExistingTags(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_unique_tags", {
    p_user_id: userId,
  });

  throwIfSupabaseError(error);

  return Array.isArray(data) ? data : [];
}

function normalizeTags(tags: string[]): string[] {
  return tags
    .map((tag) =>
      tag
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龥-]/g, "")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-"),
    )
    .filter((tag) => tag.length > 0);
}

export async function handleSave(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  draftBody: string;
  contentLanguage: ContentLanguage;
}): Promise<string[]> {
  const { supabase, providers, userId, sessionId, draftBody, contentLanguage } =
    args;

  const splitResult = await providers.llm.mini.generateStructured({
    schema: SplitOutputSchema,
    schemaName: "split",
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
  });

  const existingTags = await getExistingTags(supabase, userId);

  const ctx: ServiceContext = { supabase, providers, userId, contentLanguage };
  const savedDocs: Array<{ id: string; title: string }> = [];
  for (const doc of splitResult.documents) {
    const saved = await saveDocument({
      ctx,
      sessionId,
      body: doc.body,
      existingTags,
    });
    savedDocs.push(...saved);
  }

  trackEvent({
    supabase,
    userId,
    type: "document.saved",
    sessionId,
    payload: { doc_count: savedDocs.length },
  });

  return savedDocs.map((d) => d.title);
}

async function saveDocument(args: {
  ctx: ServiceContext;
  sessionId: string;
  body: string;
  existingTags: string[];
}): Promise<Array<{ id: string; title: string }>> {
  const { ctx, sessionId, body, existingTags } = args;
  const { supabase, providers } = ctx;
  const { embedding, vectorStore } = providers;

  const searchResults = await vectorStore.search(embedding, {
    userId: ctx.userId,
    query: body,
    limit: SIMILAR_DOC_SEARCH_LIMIT,
  });

  const docIds = [...new Set(searchResults.map((r) => r.payload.doc_id))];
  let similarDocs: Array<{ id: string; title: string; body: string }> = [];

  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from("memories")
      .select("id, title, body")
      .in("id", docIds);

    throwIfSupabaseError(error);

    similarDocs = (data ?? []).map((d) => ({
      id: String(d.id),
      title: String(d.title ?? ""),
      body: String(d.body),
    }));
  }

  const judgment = await providers.llm.standard.generateStructured({
    schema: JudgmentOutputSchema,
    schemaName: "judgment",
    systemPrompt: JUDGMENT_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildJudgmentMessage(body, similarDocs) },
    ],
  });

  if (judgment.action === "update") {
    if (!judgment.target_id) {
      throw new Error("target_id is required for update action");
    }
    const targetId = judgment.target_id;

    const reSplitResult = await providers.llm.mini.generateStructured({
      schema: SplitOutputSchema,
      schemaName: "split",
      systemPrompt: SPLIT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildSplitMessage(judgment.final_body) },
      ],
    });

    if (reSplitResult.documents.length > 1) {
      const savedDocs: Array<{ id: string; title: string }> = [];
      for (const splitDoc of reSplitResult.documents) {
        const saved = await persistDocument({
          ctx,
          sessionId,
          persistAction: { action: "create" },
          body: splitDoc.body,
          existingTags,
        });
        savedDocs.push(saved);
      }
      await deleteDocument({ supabase, userId: ctx.userId, docId: targetId });
      return savedDocs;
    }

    return [
      await persistDocument({
        ctx,
        sessionId,
        persistAction: { action: "update", targetId },
        body: judgment.final_body,
        existingTags,
      }),
    ];
  }

  return [
    await persistDocument({
      ctx,
      sessionId,
      persistAction: { action: "create" },
      body: judgment.final_body,
      existingTags,
    }),
  ];
}

interface DocumentFields {
  title: string;
  tags: string[];
  summary: string;
  titleEn: string | undefined;
  tagsEn: string[] | undefined;
  summaryEn: string | undefined;
  bodyEn: string | undefined;
}

async function generateDocumentFields(args: {
  ctx: ServiceContext;
  body: string;
  existingTags: string[];
  currentTags?: string[];
}): Promise<DocumentFields> {
  const { ctx, body, existingTags, currentTags } = args;
  if (ctx.contentLanguage === "en") {
    const meta = await ctx.providers.llm.mini.generateStructured({
      schema: MetaOutputSchema,
      schemaName: "meta",
      systemPrompt: META_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildMetaMessage({ body, existingTags, currentTags }),
        },
      ],
    });
    return {
      title: meta.title,
      tags: normalizeTags(meta.tags),
      summary: meta.summary,
      titleEn: undefined,
      tagsEn: undefined,
      summaryEn: undefined,
      bodyEn: undefined,
    };
  }

  const result = await ctx.providers.llm.standard.generateStructured({
    schema: DerivationMetaOutputSchema,
    schemaName: "derivation_meta",
    systemPrompt: DERIVATION_META_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildMetaMessage({
          body,
          existingTags,
          currentTags,
        }),
      },
    ],
  });

  return {
    title: result.title,
    tags: normalizeTags(result.tags),
    summary: result.summary,
    titleEn: result.title_en,
    tagsEn: normalizeTags(result.tags_en),
    summaryEn: result.summary_en,
    bodyEn: result.body_en,
  };
}

async function persistDocument(args: {
  ctx: ServiceContext;
  sessionId: string;
  persistAction: PersistAction;
  body: string;
  existingTags: string[];
}): Promise<{ id: string; title: string }> {
  const { ctx, persistAction, body, existingTags } = args;
  const { supabase } = ctx;

  let currentTags: string[] | undefined;
  if (persistAction.action === "update") {
    const { data, error } = await supabase
      .from("memories")
      .select("tags")
      .eq("id", persistAction.targetId)
      .single();
    throwIfSupabaseError(error);
    currentTags = Array.isArray(data?.tags) ? data.tags : undefined;
  }

  const fields = await generateDocumentFields({
    ctx,
    body,
    existingTags,
    currentTags,
  });

  let docId: string;

  // TODO(NEM-86): Memory 모델 저장 파이프라인으로 교체
  throw new Error("saving pipeline not yet implemented for Memory model");

  return { id: docId, title: fields.title };
}

async function deleteDocument({
  supabase,
  userId,
  docId,
}: {
  supabase: TypedSupabaseClient;
  userId: string;
  docId: string;
}): Promise<void> {
  // TODO(NEM-86): PGMQ 연동 삭제 이벤트 재구현 (Qdrant/Neo4j orphan 정리)
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", docId)
    .eq("user_id", userId);

  throwIfSupabaseError(error);
}
