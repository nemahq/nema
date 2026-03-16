import { z } from "zod";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildJudgmentMessage,
  buildMetaMessage,
  buildSplitMessage,
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

type PersistAction =
  | { action: "create" }
  | { action: "update"; targetId: string };

interface ServiceContext {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
}

async function getExistingTags(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("tags")
    .eq("user_id", userId);

  throwIfSupabaseError(error);

  const allTags = new Set<string>();
  for (const doc of data ?? []) {
    const tags = Array.isArray(doc.tags) ? doc.tags : [];
    for (const tag of tags) {
      if (typeof tag === "string") {
        allTags.add(tag);
      }
    }
  }
  return [...allTags];
}

export async function handleSave(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  draftBody: string;
}): Promise<void> {
  const { supabase, providers, userId, sessionId, draftBody } = args;

  const splitResult = await providers.llm.mini.generateStructured({
    schema: SplitOutputSchema,
    schemaName: "split",
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
  });

  const existingTags = await getExistingTags(supabase, userId);

  const savedDocs: Array<{ id: string; title: string }> = [];
  for (const doc of splitResult.documents) {
    const results = await saveDocument({
      ctx: { supabase, providers, userId },
      sessionId,
      body: doc.body,
      existingTags,
    });
    savedDocs.push(...results);
  }

  trackEvent(supabase, userId, "document.saved", sessionId, {
    doc_count: savedDocs.length,
  });
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
      .from("documents")
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
      const results: Array<{ id: string; title: string }> = [];
      for (const splitDoc of reSplitResult.documents) {
        const result = await persistDocument({
          ctx,
          sessionId,
          persistAction: { action: "create" },
          body: splitDoc.body,
          existingTags,
        });
        results.push(result);
      }
      await deleteDocument(supabase, ctx.userId, targetId);
      return results;
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

async function persistDocument(args: {
  ctx: ServiceContext;
  sessionId: string;
  persistAction: PersistAction;
  body: string;
  existingTags: string[];
}): Promise<{ id: string; title: string }> {
  const { ctx, sessionId, persistAction, body, existingTags } = args;
  const { supabase } = ctx;

  const meta = await ctx.providers.llm.mini.generateStructured({
    schema: MetaOutputSchema,
    schemaName: "meta",
    systemPrompt: META_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildMetaMessage(body, existingTags) }],
  });

  let docId: string;

  if (persistAction.action === "create") {
    const { data, error } = await supabase.rpc("create_document_with_event", {
      p_user_id: ctx.userId,
      p_title: meta.title,
      p_tags: meta.tags,
      p_summary: meta.summary,
      p_body: body,
      p_session_id: sessionId,
    });

    throwIfSupabaseError(error);

    if (typeof data !== "string") {
      throw new Error("create_document_with_event did not return a string id");
    }
    docId = data;
  } else {
    docId = persistAction.targetId;

    const { error } = await supabase.rpc("update_document_with_event", {
      p_doc_id: docId,
      p_user_id: ctx.userId,
      p_title: meta.title,
      p_tags: meta.tags,
      p_summary: meta.summary,
      p_body: body,
    });

    throwIfSupabaseError(error);
  }

  return { id: docId, title: meta.title };
}

async function deleteDocument(
  supabase: TypedSupabaseClient,
  userId: string,
  docId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_document_with_event", {
    p_doc_id: docId,
    p_user_id: userId,
  });

  throwIfSupabaseError(error);
}
