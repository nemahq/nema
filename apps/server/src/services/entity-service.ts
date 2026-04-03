import type {
  DocumentSummary,
  EntityGetDocumentsInput,
  EntityGetRelatedInput,
  EntityListInput,
  EntityStats,
  EntitySummary,
} from "@nema-io/shared";

import type { GraphStore } from "@server/infra/graph";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

export async function listEntitiesWithStats(opts: {
  graphStore: GraphStore;
  userId: string;
  input: EntityListInput;
}): Promise<EntitySummary[]> {
  const entities = await opts.graphStore.listEntitiesWithStats({
    userId: opts.userId,
    type: opts.input.type,
  });

  return entities.map((e) => ({
    name: e.name,
    type: e.type,
    documentCount: e.documentCount,
  }));
}

export async function getDocumentsByEntity(opts: {
  graphStore: GraphStore;
  supabase: TypedSupabaseClient;
  userId: string;
  input: EntityGetDocumentsInput;
}): Promise<DocumentSummary[]> {
  const docIds = await opts.graphStore.findDocumentsByEntity({
    userId: opts.userId,
    name: opts.input.name,
    type: opts.input.type,
  });

  if (docIds.length === 0) {
    return [];
  }

  const { data, error } = await opts.supabase
    .from("documents")
    .select("id, title, tags, summary, created_at, updated_at")
    .in("id", docIds)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error);

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    tags: row.tags,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getRelatedEntities(opts: {
  graphStore: GraphStore;
  userId: string;
  input: EntityGetRelatedInput;
}): Promise<EntitySummary[]> {
  const related = await opts.graphStore.getRelatedEntities({
    userId: opts.userId,
    name: opts.input.name,
    type: opts.input.type,
  });

  return related.map((e) => ({
    name: e.name,
    type: e.type,
    documentCount: e.documentCount,
  }));
}

export async function getSummaryStats(opts: {
  graphStore: GraphStore;
  supabase: TypedSupabaseClient;
  userId: string;
}): Promise<EntityStats> {
  const [entityCounts, { count, error }] = await Promise.all([
    opts.graphStore.getEntityCountsByType(opts.userId),
    opts.supabase.from("documents").select("*", { count: "exact", head: true }),
  ]);

  throwIfSupabaseError(error);

  return {
    totalDocuments: count ?? 0,
    entityCountByType: entityCounts.map((e) => ({
      type: e.type,
      count: e.count,
    })),
  };
}
