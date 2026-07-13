import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { DigestBody } from "@nema-io/shared";
import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_EXTERNAL_URLS_MAX,
  DIGEST_TAGS_MAX,
  DIGEST_TITLE_MAX_LENGTH,
  DIGEST_TOPICS_MAX,
  REFERENCE_EXTERNAL_URLS_MAX,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
  TOPIC_NAME_MAX_LENGTH,
} from "@nema-io/shared";

import type { Json } from "@server/infra/database.types";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { LlmTask } from "@server/infra/llm/task-routing";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type {
  GeneratedDigest,
  GeneratedReference,
} from "@server/prompts/digest-generation";
import {
  buildDigestGenerationMessage,
  DIGEST_GENERATION_SYSTEM_PROMPT,
  DigestGenerationSchema,
} from "@server/prompts/digest-generation";

import {
  registerDigestion,
  unregisterDigestion,
} from "./digestion-cancellation";
import { limitLlmCall } from "./llm-limiter";
import type { PendingDigestionSource } from "./types";
import { PendingDigestionSourceSchema } from "./types";

// 추출과 같은 상한을 미러한다 — 정리도 standard 티어 LLM 1콜이고, 제공자의 정상 응답
// 변동(measurement-log #5)을 같은 벽시계로 덮는다. lease(150초)가 이 상한을 덮는다.
export const DIGESTION_TIMEOUT_MS = 120_000;
const DIGESTION_CONCURRENCY = 3;
const MAX_RETRIES = 5;

// 레지스트리를 프롬프트에 싣는 상한 — 컨텍스트 폭주 브레이크. 넘치면 최근 것 우선
// (재사용은 최근 활동에 몰린다). 진짜 무릎은 dogfooding이 측정.
const REGISTRY_PROMPT_LIMIT = 200;

interface DigestionDeps {
  supabase: TypedSupabaseClient;
  forTask: (task: LlmTask) => LlmProvider;
}

// --- ⓪ 생성(digestion) — 원본을 Digest·Reference 후보로 정리해 리뷰 대기에 올린다 ---

export async function runDigestionPass(deps: DigestionDeps): Promise<number> {
  let processed = 0;

  while (true) {
    const sources = await fetchPendingDigestionSources(deps.supabase);
    if (sources.length === 0) {
      break;
    }
    processed += sources.length;

    for (let i = 0; i < sources.length; i += DIGESTION_CONCURRENCY) {
      const chunk = sources.slice(i, i + DIGESTION_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (source) => {
          try {
            await processDigestion(source, deps);
          } catch (err) {
            Sentry.captureException(err, {
              tags: { component: "statement-sync", phase: "digestion" },
              extra: { sourceId: source.id },
            });
            await incrementDigestionRetry(deps.supabase, {
              id: source.id,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );
    }
  }

  return processed;
}

// 취소 창구 — 사람이 "처리 중 취소"를 누르면 cancel_source_digestion이 DB를 'cancelled'로
// 옮기고(워커가 재클레임 못 함), 이 controller가 떠 있는 LLM 콜을 끊는다.
//
// 취소로 끊긴 콜은 실패가 아니다: Sentry에도 안 올리고 retry도 안 올린다(둘 다 했다간 사람이
// 의도한 정지가 오류 알림과 재시도 예산 소모로 둔갑한다). abort가 콜을 끊은 시점부터 나오는
// 예외는 종류를 안 가리고 전부 취소로 친다 — 진짜 오류가 그 찰나에 겹쳤더라도 원본은 이미
// cancelled라 재시도할 대상이 아니라서 결론이 같다.
//
// 취소가 LLM 콜이 끝난 뒤·적재 RPC 전에 도착하는 경우도 여기로 모인다: create_ingestion_review는
// digestion_status='pending'을 WHERE로 걸어 예외를 뱉고, 그 예외가 올라올 때쯤이면 abort가
// 도착해 있어(RPC 왕복은 ms, abort 전파는 µs) 같은 가드에 걸린다. DB 가드가 최종 방어선이라
// 어느 쪽이 이기든 changeset은 안 생긴다.
async function processDigestion(
  source: PendingDigestionSource,
  deps: DigestionDeps,
): Promise<void> {
  const controller = new AbortController();
  registerDigestion(source.id, controller);

  try {
    await digestSource({ source, deps, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      return;
    }
    throw err;
  } finally {
    unregisterDigestion(source.id, controller);
  }
}

async function digestSource(params: {
  source: PendingDigestionSource;
  deps: DigestionDeps;
  signal: AbortSignal;
}): Promise<void> {
  const { source, deps, signal } = params;
  const registries = await fetchRegistries(deps.supabase, {
    spaceId: source.space_id,
    workspaceId: source.workspace_id,
  });

  // 라벨 부여 + id 매핑 — LLM엔 라벨(E0…)만 보여 uuid 환각을 막는다
  const labelToId = new Map<string, string>();
  const referenceContext = registries.references.map((reference, index) => {
    const label = `E${index}`;
    labelToId.set(label, reference.id);
    return { label, type: reference.type, title: reference.title };
  });

  const message = buildDigestGenerationMessage(source.body, {
    existingTopics: registries.topics,
    existingTags: registries.tags,
    existingReferences: referenceContext,
  });

  const output = await limitLlmCall(() =>
    deps.forTask("generateDigests").generateStructured({
      schema: DigestGenerationSchema,
      schemaName: "digest_generation",
      systemPrompt: DIGEST_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      timeoutMs: DIGESTION_TIMEOUT_MS,
      maxRetries: 0,
      signal,
    }),
  );

  // 콜이 끝난 뒤 도착한 취소 — 결과를 버린다. 여기서 안 걸러도 적재 RPC의 pending 가드가
  // 막지만, 그건 예외 경로라 취소가 조용한 정지가 아니라 오류처럼 보이게 된다.
  if (signal.aborted) {
    return;
  }

  const normalized = normalizeGeneratedDigests(output, {
    labelToId,
    existingTags: registries.tags,
  });

  // 판단이 없는 글(잡담뿐) — 리뷰 없이 완료만. 원본은 pending에 남아
  // 사용자가 휴지통으로 정리한다.
  if (normalized.digests.length === 0) {
    const { error } = await deps.supabase.rpc("complete_source_digestion", {
      p_source_id: source.id,
    });
    if (error) {
      throw new Error(
        `complete_source_digestion failed for ${source.id}: ${error.message}`,
      );
    }
    return;
  }

  const { error } = await deps.supabase.rpc("create_ingestion_review", {
    p_source_id: source.id,
    // RPC가 jsonb로 받는다 — 계약 상대는 write_ingestion_review_changes가 읽는
    // 키(digest: title/description/body/topics/tags/reference_ids/new_reference_keys/
    // external_urls, reference: key/type/title/body/external_urls)다. 키를 바꾸면 RPC도 함께 고친다.
    p_digests: normalized.digests as unknown as Json,
    p_new_references: normalized.newReferences as unknown as Json,
  });
  if (error) {
    throw new Error(
      `create_ingestion_review failed for ${source.id}: ${error.message}`,
    );
  }
}

// --- 레지스트리 조회 — 재사용 유도용 프롬프트 컨텍스트 ---

interface Registries {
  topics: string[];
  tags: Array<{ title: string; description: string }>;
  references: Array<{ id: string; type: string; title: string }>;
}

async function fetchRegistries(
  supabase: TypedSupabaseClient,
  scope: { spaceId: string; workspaceId: string },
): Promise<Registries> {
  const [topicsResult, tagsResult, referencesResult] = await Promise.all([
    supabase
      .from("topics")
      .select("name")
      .eq("space_id", scope.spaceId)
      .order("updated_at", { ascending: false })
      .limit(REGISTRY_PROMPT_LIMIT),
    supabase
      .from("tags")
      .select("title, description")
      .eq("workspace_id", scope.workspaceId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(REGISTRY_PROMPT_LIMIT),
    supabase
      .from("references")
      .select("id, type, title")
      .eq("workspace_id", scope.workspaceId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(REGISTRY_PROMPT_LIMIT),
  ]);

  if (topicsResult.error) {
    throw new Error(`fetch topics failed: ${topicsResult.error.message}`);
  }
  if (tagsResult.error) {
    throw new Error(`fetch tags failed: ${tagsResult.error.message}`);
  }
  if (referencesResult.error) {
    throw new Error(
      `fetch references failed: ${referencesResult.error.message}`,
    );
  }

  return {
    topics: (topicsResult.data ?? []).map((row) => row.name),
    tags: tagsResult.data ?? [],
    references: referencesResult.data ?? [],
  };
}

// --- 정규화 — LLM 출력(신뢰 경계 밖)을 RPC 계약 형태로 ---

interface RpcDigest {
  title: string;
  description: string;
  body: DigestBody;
  topics: string[];
  tags: Array<{ title: string; description: string }>;
  reference_ids: string[];
  new_reference_keys: string[];
  external_urls: string[];
}

interface RpcNewReference {
  key: string;
  type: string;
  title: string;
  body: string;
  external_urls: string[];
}

// 평평한 LLM 출력을 타입별 판별 유니언으로 조립한다 — 타입 밖 필드는 버린다
// (프롬프트가 null을 지시하지만 LLM이 어겨도 DB에 새지 않게 코드로 강제).
export function buildDigestBody(digest: GeneratedDigest): DigestBody {
  const text = (value: string | null): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const list = (value: string[] | null): string[] | undefined => {
    const items = (value ?? [])
      .map((item) => item.trim())
      .filter((item) => item !== "");
    return items.length > 0 ? items : undefined;
  };

  switch (digest.type) {
    case "decision":
      return {
        type: "decision",
        situation: text(digest.situation),
        choice: text(digest.choice),
        reason: text(digest.reason),
        tradeoff: list(digest.tradeoff),
        alternatives: list(digest.alternatives),
      };
    case "pending":
      return {
        type: "pending",
        question: text(digest.question),
        background: text(digest.background),
        branches: list(digest.branches),
        resolutionCondition: text(digest.resolutionCondition),
      };
    case "learning":
      return {
        type: "learning",
        finding: text(digest.finding),
        evidence: text(digest.evidence),
      };
    case "idea":
      return {
        type: "idea",
        concept: text(digest.concept),
        background: text(digest.background),
        branches: list(digest.branches),
      };
    case "assumption":
      return {
        type: "assumption",
        assumption: text(digest.assumption),
        evidence: text(digest.evidence),
        impact: text(digest.impact),
        verificationCondition: text(digest.verificationCondition),
      };
  }
}

function sanitizeLabels(params: {
  labels: string[];
  maxLength: number;
  maxCount: number;
}): string[] {
  const { labels, maxLength, maxCount } = params;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed === "" || trimmed.length > maxLength || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= maxCount) {
      break;
    }
  }
  return result;
}

function sanitizeUrls(urls: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (seen.has(trimmed)) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

// LLM 출력은 신뢰 경계 밖 — 라벨·키 환각은 버리고, 길이·개수 상한을 코드로 강제한다.
// 어떤 Digest도 인용하지 않는 신규 레퍼런스 제안은 버린다(인용 없는 등록은 노이즈).
export function normalizeGeneratedDigests(
  output: { digests: GeneratedDigest[]; newReferences: GeneratedReference[] },
  context: {
    labelToId: Map<string, string>;
    existingTags: Array<{ title: string; description: string }>;
  },
): { digests: RpcDigest[]; newReferences: RpcNewReference[] } {
  const tagDescriptionByTitle = new Map(
    context.existingTags.map((tag) => [tag.title, tag.description]),
  );

  const referencesByKey = new Map<string, RpcNewReference>();
  for (const reference of output.newReferences) {
    const key = reference.key.trim();
    if (key === "" || referencesByKey.has(key)) {
      continue;
    }
    referencesByKey.set(key, {
      key,
      type: reference.type,
      title: reference.title.trim(),
      body: reference.body.trim(),
      external_urls: sanitizeUrls(
        reference.externalUrls,
        REFERENCE_EXTERNAL_URLS_MAX,
      ),
    });
  }

  const digests: RpcDigest[] = [];
  const citedKeys = new Set<string>();

  for (const digest of output.digests) {
    const referenceIds = [
      ...new Set(
        digest.existingReferenceLabels
          .map((label) => context.labelToId.get(label.trim()))
          .filter((id): id is string => id !== undefined),
      ),
    ];
    const newReferenceKeys = [
      ...new Set(
        digest.newReferenceKeys
          .map((key) => key.trim())
          .filter((key) => referencesByKey.has(key)),
      ),
    ];

    const tags: Array<{ title: string; description: string }> = [];
    for (const tag of digest.tags) {
      const title = tag.title.trim();
      // 정의가 비면 레지스트리의 기존 정의로 보충 — 그래도 없으면 Tag 자격 미달(07-modeling)
      const description =
        tag.description.trim() || (tagDescriptionByTitle.get(title) ?? "");
      if (
        title === "" ||
        title.length > TAG_TITLE_MAX_LENGTH ||
        description === "" ||
        description.length > TAG_DESCRIPTION_MAX_LENGTH ||
        tags.some((existing) => existing.title === title)
      ) {
        continue;
      }
      tags.push({ title, description });
      if (tags.length >= DIGEST_TAGS_MAX) {
        break;
      }
    }

    for (const key of newReferenceKeys) {
      citedKeys.add(key);
    }

    digests.push({
      title: digest.title.slice(0, DIGEST_TITLE_MAX_LENGTH),
      description: digest.description.slice(0, DIGEST_DESCRIPTION_MAX_LENGTH),
      body: buildDigestBody(digest),
      topics: sanitizeLabels({
        labels: digest.topics,
        maxLength: TOPIC_NAME_MAX_LENGTH,
        maxCount: DIGEST_TOPICS_MAX,
      }),
      tags,
      reference_ids: referenceIds,
      new_reference_keys: newReferenceKeys,
      external_urls: sanitizeUrls(
        digest.externalUrls,
        DIGEST_EXTERNAL_URLS_MAX,
      ),
    });
  }

  return {
    digests,
    newReferences: [...referencesByKey.values()].filter((reference) =>
      citedKeys.has(reference.key),
    ),
  };
}

// --- 인출·재시도 RPC ---

async function fetchPendingDigestionSources(
  supabase: TypedSupabaseClient,
): Promise<PendingDigestionSource[]> {
  const { data, error } = await supabase.rpc(
    "fetch_pending_digestion_sources",
    { p_max_retries: MAX_RETRIES },
  );
  if (error) {
    throw new Error(`fetch_pending_digestion_sources failed: ${error.message}`);
  }

  const parsed = z.array(PendingDigestionSourceSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error(
      `pending digestion source validation failed: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

async function incrementDigestionRetry(
  supabase: TypedSupabaseClient,
  params: { id: string; errorMessage: string },
): Promise<void> {
  const { error } = await supabase.rpc("increment_source_digestion_retry", {
    p_source_id: params.id,
    p_max_retries: MAX_RETRIES,
    p_error_message: params.errorMessage,
  });
  if (error) {
    Sentry.captureException(
      new Error(`increment retry failed for ${params.id}: ${error.message}`),
      { tags: { component: "statement-sync", phase: "digestion" } },
    );
  }
}
