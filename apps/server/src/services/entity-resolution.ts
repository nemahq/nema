import * as Sentry from "@sentry/node";

import type { EntityType } from "@nema-io/shared";

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

const FUZZY_DICE_THRESHOLD = 0.9;
const FUZZY_OVERLAP_THRESHOLD = 0.95;
const FUZZY_OVERLAP_MAX_LEN_DIFF = 2;
const FUZZY_MIN_ENTROPY = 1.5;
const SHINGLE_SIZE_DEFAULT = 3;
const SHINGLE_SIZE_CJK = 2;
const EMBEDDING_CANDIDATE_LIMIT = 15;
const EMBEDDING_SCORE_THRESHOLD = 0.6;
const EXISTING_ENTITIES_LIMIT = 1000;

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
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const CJK_RANGE = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

function containsCjk(s: string): boolean {
  return CJK_RANGE.test(s);
}

function shingleSize(s: string): number {
  return containsCjk(s) ? SHINGLE_SIZE_CJK : SHINGLE_SIZE_DEFAULT;
}

function shingles(s: string, size: number): Set<string> {
  const result = new Set<string>();
  const normalized = normalize(s);
  for (let i = 0; i <= normalized.length - size; i++) {
    result.add(normalized.slice(i, i + size));
  }
  return result;
}

function intersectionCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const shingle of a) {
    if (b.has(shingle)) {
      count++;
    }
  }
  return count;
}

function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  const total = a.size + b.size;
  return total === 0 ? 0 : (2 * intersectionCount(a, b)) / total;
}

function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  const minSize = Math.min(a.size, b.size);
  if (minSize === 0) {
    return 0;
  }
  return intersectionCount(a, b) / minSize;
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

  const byType = new Map<EntityType, GraphEntity[]>();
  for (const entity of extractedEntities) {
    const group = byType.get(entity.type) ?? [];
    group.push(entity);
    byType.set(entity.type, group);
  }

  const existingByType = new Map<EntityType, GraphEntity[]>();
  for (const type of byType.keys()) {
    try {
      const existing = await graphStore.listEntities({
        userId,
        type,
        limit: EXISTING_ENTITIES_LIMIT,
      });
      existingByType.set(type, existing);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: "entity-resolution", stage: "listEntities" },
        extra: { userId, type },
      });
      existingByType.set(type, []);
    }
  }

  const resolved = new Map<GraphEntity, string | null>();

  // --- Stage 1: 정규화 일치 ---
  for (const entity of extractedEntities) {
    const existing = existingByType.get(entity.type) ?? [];
    const normalizedName = normalize(entity.name);
    const match = existing.find((e) => normalize(e.name) === normalizedName);
    if (match) {
      resolved.set(entity, match.name);
    }
  }

  // --- Stage 2: 퍼지 매칭 (Dice + Overlap 보조, CJK bigram) ---
  const afterStage1 = extractedEntities.filter((e) => !resolved.has(e));

  for (const entity of afterStage1) {
    if (shannonEntropy(entity.name) < FUZZY_MIN_ENTROPY) {
      continue;
    }

    const size = shingleSize(entity.name);
    const entityShingles = shingles(entity.name, size);
    if (entityShingles.size === 0) {
      continue;
    }

    const existing = existingByType.get(entity.type) ?? [];
    for (const candidate of existing) {
      const candidateShingles = shingles(candidate.name, size);
      const dice = diceSimilarity(entityShingles, candidateShingles);
      if (dice >= FUZZY_DICE_THRESHOLD) {
        resolved.set(entity, candidate.name);
        break;
      }
      // Dice 미달이지만 한쪽이 다른 쪽을 거의 포함하고 길이 차이가 작으면 매칭
      const lenDiff = Math.abs(entity.name.length - candidate.name.length);
      if (
        lenDiff <= FUZZY_OVERLAP_MAX_LEN_DIFF &&
        overlapCoefficient(entityShingles, candidateShingles) >=
          FUZZY_OVERLAP_THRESHOLD
      ) {
        resolved.set(entity, candidate.name);
        break;
      }
    }
  }

  // --- Stage 3: 임베딩 유사도 → 후보 수집 ---
  const afterStage2 = extractedEntities.filter((e) => !resolved.has(e));

  const candidatesMap = new Map<GraphEntity, EntitySearchResult[]>();

  for (const entity of afterStage2) {
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

  // --- Stage 4: LLM 판정 ---
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
