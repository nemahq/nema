import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphEntity, GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type {
  EntitySearchResult,
  EntityVectorStore,
} from "@server/infra/vector";
import {
  buildEntityResolutionMessage,
  ENTITY_RESOLUTION_SYSTEM_PROMPT,
  EntityResolutionSchema,
} from "@server/prompts/entity-resolution";

// --- 상수 ---

const EMBEDDING_CANDIDATE_LIMIT = 15;
const EMBEDDING_SCORE_THRESHOLD = 0.6;

// --- 타입 ---

interface ResolvedEntity extends GraphEntity {
  isNew: boolean;
}

interface ResolveEntitiesOptions {
  extractedEntities: GraphEntity[];
  userId: string;
  graphStore: GraphStore;
  entityVectorStore: EntityVectorStore;
  embedding: EmbeddingProvider;
  llm: LlmProvider;
}

// --- 유틸 ---

function normalize(name: string): string {
  return name.toLowerCase().trim();
}

// --- 메인 ---

export async function resolveEntities(
  opts: ResolveEntitiesOptions,
): Promise<ResolvedEntity[]> {
  const {
    extractedEntities,
    userId,
    graphStore,
    entityVectorStore,
    embedding,
    llm,
  } = opts;

  if (extractedEntities.length === 0) {
    return [];
  }

  const resolved = new Map<GraphEntity, string | null>();

  // --- Stage 1: 정규화 일치 (Neo4j Cypher) ---
  try {
    const queries = extractedEntities.map((e) => ({
      type: e.type,
      normalizedName: normalize(e.name),
    }));
    const matches = await graphStore.findEntitiesByNormalizedNames({
      userId,
      queries,
    });
    const matchMap = new Map(
      matches.map((m) => [`${m.type}:${m.normalizedName}`, m.name]),
    );
    for (const entity of extractedEntities) {
      const matchedName = matchMap.get(
        `${entity.type}:${normalize(entity.name)}`,
      );
      if (matchedName) {
        resolved.set(entity, matchedName);
      }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "entity-resolution", stage: "normalizedNameLookup" },
      extra: { userId, queryCount: extractedEntities.length },
    });
  }

  // --- Stage 2: 임베딩 유사도 → 후보 수집 ---
  const afterStage1 = extractedEntities.filter((e) => !resolved.has(e));

  const candidatesMap = new Map<GraphEntity, EntitySearchResult[]>();

  for (const entity of afterStage1) {
    try {
      const results = await entityVectorStore.search(embedding, {
        userId,
        type: entity.type,
        query: entity.name,
        limit: EMBEDDING_CANDIDATE_LIMIT,
        scoreThreshold: EMBEDDING_SCORE_THRESHOLD,
      });

      if (results.length === 0) {
        resolved.set(entity, null);
      } else {
        candidatesMap.set(entity, results);
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "entity-resolution", stage: "embedding" },
        extra: { userId, entityName: entity.name, entityType: entity.type },
      });
      resolved.set(entity, null);
    }
  }

  // --- Stage 3: LLM 판정 ---
  const needsLlm = [...candidatesMap.entries()];

  if (needsLlm.length > 0) {
    const entries = needsLlm.map(([entity, candidates]) => ({
      extractedName: entity.name,
      extractedType: entity.type,
      candidates: candidates.map((c) => ({ name: c.name, score: c.score })),
    }));

    try {
      const result = await llm.generateStructured({
        schema: EntityResolutionSchema,
        schemaName: "entity_resolution",
        systemPrompt: ENTITY_RESOLUTION_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildEntityResolutionMessage(entries) },
        ],
      });

      for (const resolution of result.resolutions) {
        const entity = needsLlm.find(
          ([e]) =>
            e.name === resolution.extractedName &&
            e.type === resolution.extractedType,
        )?.[0];
        if (entity) {
          resolved.set(entity, resolution.matchedName);
        } else {
          Sentry.captureMessage(
            `[entity-resolution] LLM returned unrecognized entity: "${resolution.extractedName}" (${resolution.extractedType})`,
            {
              level: "warning",
              extra: {
                userId,
                expectedNames: needsLlm.map(([e]) => e.name),
              },
            },
          );
        }
      }

      // LLM이 일부 엔티티 판정을 누락한 경우 새 엔티티로 처리
      for (const [entity] of needsLlm) {
        if (!resolved.has(entity)) {
          resolved.set(entity, null);
        }
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "entity-resolution", stage: "llm" },
        extra: {
          userId,
          entityCount: needsLlm.length,
          entities: needsLlm.slice(0, 5).map(([e]) => e.name),
        },
      });
      for (const [entity] of needsLlm) {
        resolved.set(entity, null);
      }
    }
  }

  // --- 결과 조립 ---
  return extractedEntities.map((entity) => {
    const matchedName = resolved.get(entity);
    if (matchedName) {
      return {
        type: entity.type,
        name: matchedName,
        nameEn: entity.nameEn,
        isNew: false,
      };
    }
    return {
      type: entity.type,
      name: entity.name,
      nameEn: entity.nameEn,
      isNew: true,
    };
  });
}
