import type { EntityType } from "@nema-io/shared";

import type { EmbeddingProvider } from "@server/infra/embedding";

export interface EntityUpsertOptions {
  userId: string;
  entities: Array<{ name: string; type: EntityType }>;
}

export interface EntitySearchOptions {
  userId: string;
  type: EntityType;
  query: string;
  limit?: number;
  scoreThreshold?: number;
}

export interface EntitySearchResult {
  name: string;
  type: EntityType;
  score: number;
}

export interface EntityDeleteOptions {
  userId: string;
  type: EntityType;
  name: string;
}

export interface EntityPruneOptions {
  userId: string;
  liveEntities: Array<{ type: EntityType; name: string }>;
}

export interface EntityVectorStore {
  ensureCollection(): Promise<void>;
  upsert(
    provider: EmbeddingProvider,
    options: EntityUpsertOptions,
  ): Promise<void>;
  search(
    provider: EmbeddingProvider,
    options: EntitySearchOptions,
  ): Promise<EntitySearchResult[]>;
  deleteByEntities(entities: EntityDeleteOptions[]): Promise<void>;
  pruneOrphans(options: EntityPruneOptions): Promise<number>;
}
