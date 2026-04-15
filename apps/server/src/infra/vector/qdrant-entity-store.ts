import { v5 as uuidv5 } from "uuid";

import type { EntityType } from "@nema-io/shared";

import {
  type EmbeddingProvider,
  VECTOR_DIMENSION,
} from "@server/infra/embedding";

import type {
  EntitySearchOptions,
  EntitySearchResult,
  EntityUpsertOptions,
  EntityVectorStore,
} from "./entity-vector-store";
import type { QdrantClient } from "./qdrant-client";
import { VectorStoreError } from "./vector-store";

const ENTITY_COLLECTION = "entities";

interface EntityPayload {
  user_id: string;
  name: string;
  type: EntityType;
  embedding_model: string;
}

const ENTITY_UUID_NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function entityPointId(opts: {
  userId: string;
  type: EntityType;
  name: string;
}): string {
  return uuidv5(
    `${opts.userId}:${opts.type}:${opts.name}`,
    ENTITY_UUID_NAMESPACE,
  );
}

export function createQdrantEntityStore(
  client: QdrantClient,
): EntityVectorStore {
  async function ensurePayloadIndexes(): Promise<void> {
    await client.createPayloadIndex(ENTITY_COLLECTION, {
      field_name: "user_id",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(ENTITY_COLLECTION, {
      field_name: "type",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(ENTITY_COLLECTION, {
      field_name: "name",
      field_schema: "keyword",
    });
  }

  return {
    async ensureCollection(): Promise<void> {
      try {
        const { exists } = await client.collectionExists(ENTITY_COLLECTION);
        if (!exists) {
          try {
            await client.createCollection(ENTITY_COLLECTION, {
              vectors: { size: VECTOR_DIMENSION, distance: "Cosine" },
              quantization_config: {
                scalar: { type: "int8", always_ram: true },
              },
            });
          } catch (createError) {
            const { exists: recheck } =
              await client.collectionExists(ENTITY_COLLECTION);
            if (!recheck) {
              throw new VectorStoreError(
                `Failed to create entity collection: ${createError instanceof Error ? createError.message : String(createError)}`,
                "ensureCollection",
                createError,
              );
            }
          }
          await ensurePayloadIndexes();
        }
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Failed to ensure entity collection: ${error instanceof Error ? error.message : String(error)}`,
          "ensureCollection",
          error,
        );
      }
    },

    async upsert(
      provider: EmbeddingProvider,
      options: EntityUpsertOptions,
    ): Promise<void> {
      const { userId, entities } = options;

      if (entities.length === 0) {
        return;
      }

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "upsert",
        );
      }

      try {
        const texts = entities.map((e) => e.name);
        const result = await provider.embed(texts, "document");

        if (result.embeddings.length !== entities.length) {
          throw new VectorStoreError(
            `Embedding count mismatch: expected ${entities.length}, got ${result.embeddings.length}`,
            "upsert",
          );
        }

        const points = result.embeddings.map((vector, index) => {
          const entity = entities[index];
          const payload: EntityPayload = {
            user_id: userId,
            name: entity.name,
            type: entity.type,
            embedding_model: `${provider.providerId}/${provider.model}`,
          };
          return {
            id: entityPointId({ userId, type: entity.type, name: entity.name }),
            vector,
            payload: payload as unknown as Record<string, unknown>,
          };
        });

        await client.upsert(ENTITY_COLLECTION, {
          wait: true,
          points,
        });
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Entity upsert failed: ${error instanceof Error ? error.message : String(error)}`,
          "upsert",
          error,
        );
      }
    },

    async search(
      provider: EmbeddingProvider,
      options: EntitySearchOptions,
    ): Promise<EntitySearchResult[]> {
      const { userId, type, query, limit = 15, scoreThreshold = 0.6 } = options;

      if (provider.dimension !== VECTOR_DIMENSION) {
        throw new VectorStoreError(
          `Provider dimension ${provider.dimension} does not match collection vector size ${VECTOR_DIMENSION}`,
          "search",
        );
      }

      try {
        const result = await provider.embed([query], "query");
        const vector = result.embeddings[0];

        if (!vector) {
          throw new VectorStoreError(
            "Embedding provider returned no vector for entity search query",
            "search",
          );
        }

        const searchResult = await client.search(ENTITY_COLLECTION, {
          vector,
          limit,
          filter: {
            must: [
              { key: "user_id", match: { value: userId } },
              { key: "type", match: { value: type } },
            ],
          },
          with_payload: true,
          score_threshold: scoreThreshold,
        });

        return searchResult.map((point) => {
          const payload = point.payload as unknown as EntityPayload;
          return {
            name: payload.name,
            type: payload.type,
            score: point.score,
          };
        });
      } catch (error) {
        if (error instanceof VectorStoreError) {
          throw error;
        }
        throw new VectorStoreError(
          `Entity search failed: ${error instanceof Error ? error.message : String(error)}`,
          "search",
          error,
        );
      }
    },
  };
}
