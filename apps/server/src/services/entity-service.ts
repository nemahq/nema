import * as Sentry from "@sentry/node";

import type {
  DocumentSummary,
  EntityGetDocumentsInput,
  EntityGetRelatedInput,
  EntityGraph,
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
    nameEn: e.nameEn,
    type: e.type,
    documentCount: e.documentCount,
    lastReferencedAt: e.lastReferencedAt,
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
    nameEn: opts.input.nameEn,
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

  if (data.length < docIds.length) {
    Sentry.captureMessage(
      "[entity-service] Neo4j returned docIds not found in Supabase — possible sync drift",
      {
        level: "warning",
        extra: {
          entityNameEn: opts.input.nameEn,
          entityType: opts.input.type,
          neo4jCount: docIds.length,
          supabaseCount: data.length,
        },
      },
    );
  }

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
    nameEn: opts.input.nameEn,
    type: opts.input.type,
  });

  return related.map((e) => ({
    name: e.name,
    nameEn: e.nameEn,
    type: e.type,
    documentCount: e.documentCount,
  }));
}

export async function getGraph(opts: {
  graphStore: GraphStore;
  userId: string;
}): Promise<EntityGraph> {
  const graphData = await opts.graphStore.getGraph({ userId: opts.userId });

  const toKey = (type: string, name: string) => `${type}:${name}`;

  return {
    nodes: graphData.entities.map((e) => ({
      id: toKey(e.type, e.name),
      name: e.name,
      type: e.type,
      documentCount: e.documentCount,
    })),
    edges: graphData.edges.map((e) => ({
      source: toKey(e.sourceType, e.sourceName),
      target: toKey(e.targetType, e.targetName),
    })),
  };
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

  if (count === null) {
    Sentry.captureMessage(
      "[entity-service] documents count query returned null — expected number",
      { level: "warning", extra: { userId: opts.userId } },
    );
  }

  return {
    totalDocuments: count ?? 0,
    entityCountByType: entityCounts.map((e) => ({
      type: e.type,
      count: e.count,
    })),
  };
}
