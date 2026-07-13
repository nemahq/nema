import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/node";

import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { GeneratedDigest } from "@server/prompts/digest-generation";

import {
  buildDigestBody,
  normalizeGeneratedDigests,
  runDigestionPass,
} from "./digestion";
import { abortDigestion } from "./digestion-cancellation";

function makeGeneratedDigest(
  overrides: Partial<GeneratedDigest> = {},
): GeneratedDigest {
  return {
    type: "decision",
    title: "배포 도구는 A로 결정",
    description: "팀 숙련도를 근거로 배포 도구를 A로 정했다",
    situation: "배포 도구를 골라야 했다",
    choice: "A",
    reason: "팀이 이미 익숙하다",
    tradeoff: null,
    alternatives: null,
    question: null,
    background: null,
    branches: null,
    resolutionCondition: null,
    finding: null,
    evidence: null,
    concept: null,
    assumption: null,
    impact: null,
    verificationCondition: null,
    topics: [],
    tags: [],
    existingReferenceLabels: [],
    newReferenceKeys: [],
    externalUrls: [],
    ...overrides,
  };
}

describe("buildDigestBody", () => {
  it("타입 밖 필드를 버린다 — LLM이 null 지시를 어겨도 DB에 새지 않는다", () => {
    const body = buildDigestBody(
      makeGeneratedDigest({
        type: "learning",
        finding: "고객은 온보딩에서 이탈한다",
        evidence: "세 명의 인터뷰",
        // decision 필드가 채워져 와도 learning body엔 없어야 한다
        choice: "A",
        reason: "이유",
      }),
    );

    expect(body).toEqual({
      type: "learning",
      finding: "고객은 온보딩에서 이탈한다",
      evidence: "세 명의 인터뷰",
    });
  });

  it("빈 문자열·공백 필드는 값 없음으로 취급한다", () => {
    const body = buildDigestBody(
      makeGeneratedDigest({
        situation: "  ",
        choice: "A",
        reason: null,
        tradeoff: ["", "  "],
      }),
    );

    expect(body).toEqual({ type: "decision", choice: "A" });
  });
});

describe("normalizeGeneratedDigests", () => {
  const emptyContext = {
    labelToId: new Map<string, string>(),
    existingTags: [],
  };

  it("환각 레퍼런스 라벨은 버리고 실재 라벨만 id로 해석한다", () => {
    const labelToId = new Map([["E0", "11111111-1111-1111-1111-111111111111"]]);
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            existingReferenceLabels: ["E0", "E7", "E0"],
          }),
        ],
        newReferences: [],
      },
      { labelToId, existingTags: [] },
    );

    expect(digests[0]?.reference_ids).toEqual([
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("어떤 Digest도 인용하지 않는 신규 레퍼런스 제안은 버린다", () => {
    const { digests, newReferences } = normalizeGeneratedDigests(
      {
        digests: [makeGeneratedDigest({ newReferenceKeys: ["R1"] })],
        newReferences: [
          {
            key: "R1",
            type: "person",
            title: "김 대리",
            body: "동료",
            externalUrls: ["https://linkedin.com/in/kim", "not-a-url"],
          },
          {
            key: "R2",
            type: "term",
            title: "고아 용어",
            body: "미인용",
            externalUrls: [],
          },
        ],
      },
      emptyContext,
    );

    expect(digests[0]?.new_reference_keys).toEqual(["R1"]);
    expect(newReferences.map((reference) => reference.key)).toEqual(["R1"]);
    // 대표 링크는 위생(잘못된 URL 폐기)을 거쳐 RPC 계약 형태로 통과된다
    expect(newReferences[0]?.external_urls).toEqual([
      "https://linkedin.com/in/kim",
    ]);
  });

  it("모르는 신규 레퍼런스 키 인용은 버린다 — 끊긴 키가 확정 시 유령 인용이 된다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [makeGeneratedDigest({ newReferenceKeys: ["R9"] })],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.new_reference_keys).toEqual([]);
  });

  it("정의 없는 태그는 레지스트리 정의로 보충하고, 그래도 없으면 버린다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            tags: [
              { title: "기술결정", description: "" },
              { title: "정의없는신규", description: "" },
            ],
          }),
        ],
        newReferences: [],
      },
      {
        labelToId: new Map(),
        existingTags: [
          { title: "기술결정", description: "기술 스택·도구 선택의 근거" },
        ],
      },
    );

    expect(digests[0]?.tags).toEqual([
      { title: "기술결정", description: "기술 스택·도구 선택의 근거" },
    ]);
  });

  it("토픽은 개수 상한(5)과 길이 상한(50자)을 코드로 강제한다 — 기계 경로는 Zod를 우회한다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            topics: [
              "가".repeat(51),
              "주제1",
              "주제1",
              "주제2",
              "주제3",
              "주제4",
              "주제5",
              "주제6",
            ],
          }),
        ],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.topics).toEqual([
      "주제1",
      "주제2",
      "주제3",
      "주제4",
      "주제5",
    ]);
  });

  it("태그도 개수 상한(5)과 제목 길이 상한(50자)을 코드로 강제한다", () => {
    const overLength = { title: "가".repeat(51), description: "정의" };
    const numbered = Array.from({ length: 6 }, (_, index) => ({
      title: `태그${index}`,
      description: `정의${index}`,
    }));
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [makeGeneratedDigest({ tags: [overLength, ...numbered] })],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.tags.map((tag) => tag.title)).toEqual([
      "태그0",
      "태그1",
      "태그2",
      "태그3",
      "태그4",
    ]);
  });

  it("URL이 아닌 문자열과 http(s) 밖 스킴은 버린다", () => {
    const { digests } = normalizeGeneratedDigests(
      {
        digests: [
          makeGeneratedDigest({
            externalUrls: [
              "https://example.com/doc",
              "노션 페이지 참고",
              "javascript:alert(1)",
            ],
          }),
        ],
        newReferences: [],
      },
      emptyContext,
    );

    expect(digests[0]?.external_urls).toEqual(["https://example.com/doc"]);
  });
});

// --- 취소 (intake-flow "처리 중 취소") ---

const SOURCE_ID = "a0000000-0000-4000-a000-000000000001";
const SPACE_ID = "b0000000-0000-4000-a000-000000000001";
const WORKSPACE_ID = "d0000000-0000-4000-a000-000000000001";

const PENDING_DIGESTION_SOURCE = {
  id: SOURCE_ID,
  space_id: SPACE_ID,
  workspace_id: WORKSPACE_ID,
  author_id: null,
  body: "테스트 원문",
  created_at: "2026-07-13T00:00:00.000Z",
};

// 레지스트리 조회(.from) 체인 stub — 전부 빈 목록으로 resolve
function registryStub() {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    stub[method] = () => stub;
  }
  stub["then"] = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data: [], error: null });
  return stub;
}

// fetch_pending_digestion_sources는 첫 호출만 원본 1개, 이후 빈 배열(패스 종료)
function mockDigestionSupabase() {
  let fetched = false;
  const rpc = vi.fn(async (name: string) => {
    if (name === "fetch_pending_digestion_sources") {
      if (fetched) {
        return { data: [], error: null };
      }
      fetched = true;
      return { data: [PENDING_DIGESTION_SOURCE], error: null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn(() => registryStub());
  return { supabase: { rpc, from } as unknown as TypedSupabaseClient, rpc };
}

function digestionLlm(
  generateStructured: LlmProvider["generateStructured"],
): LlmProvider {
  return {
    generateStructured,
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn().mockResolvedValue(""),
  };
}

const ONE_DIGEST_OUTPUT = {
  digests: [makeGeneratedDigest()],
  newReferences: [],
};

function rpcNames(rpc: ReturnType<typeof vi.fn>): string[] {
  return rpc.mock.calls.map(([name]) => name as string);
}

describe("runDigestionPass — 취소", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("취소가 진행 중인 LLM 콜을 끊는다 — signal을 콜에 실어 보낸다", async () => {
    const { supabase } = mockDigestionSupabase();
    let received: AbortSignal | undefined;

    const llm = digestionLlm(
      vi.fn(async (params: { signal?: AbortSignal }) => {
        received = params.signal;
        return ONE_DIGEST_OUTPUT;
      }) as unknown as LlmProvider["generateStructured"],
    );

    await runDigestionPass({ supabase, forTask: () => llm });

    // signal이 안 실리면 취소는 프로바이더까지 못 닿아 콜이 끝까지 돌고 토큰만 태운다
    expect(received).toBeInstanceOf(AbortSignal);
  });

  it("취소로 끊긴 콜은 실패가 아니다 — retry도 Sentry도 없다", async () => {
    const { supabase, rpc } = mockDigestionSupabase();

    // 콜이 떠 있는 동안 취소가 도착한 상황 — abort가 프로바이더 요청을 끊어 예외로 돌아온다
    const llm = digestionLlm(
      vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("Request was aborted.")),
            );
            abortDigestion(SOURCE_ID);
          }),
      ) as unknown as LlmProvider["generateStructured"],
    );

    await runDigestionPass({ supabase, forTask: () => llm });

    // 사람이 의도한 정지가 오류 알림·재시도 예산 소모로 둔갑하면 안 된다
    expect(rpcNames(rpc)).not.toContain("increment_source_digestion_retry");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("콜이 끝난 뒤 도착한 취소 — 결과를 버리고 리뷰를 만들지 않는다", async () => {
    const { supabase, rpc } = mockDigestionSupabase();

    const llm = digestionLlm(
      vi.fn(async () => {
        abortDigestion(SOURCE_ID);
        return ONE_DIGEST_OUTPUT;
      }) as unknown as LlmProvider["generateStructured"],
    );

    await runDigestionPass({ supabase, forTask: () => llm });

    // 취소한 초안에 리뷰가 뒤늦게 튀어나오면 "멈췄다"는 약속이 깨진다
    expect(rpcNames(rpc)).not.toContain("create_ingestion_review");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("취소가 없으면 평소대로 리뷰를 적재한다", async () => {
    const { supabase, rpc } = mockDigestionSupabase();
    const llm = digestionLlm(
      vi.fn(
        async () => ONE_DIGEST_OUTPUT,
      ) as unknown as LlmProvider["generateStructured"],
    );

    await runDigestionPass({ supabase, forTask: () => llm });

    expect(rpcNames(rpc)).toContain("create_ingestion_review");
  });

  it("진짜 LLM 실패는 그대로 retry 경로를 탄다 — 취소 가드가 오류를 삼키지 않는다", async () => {
    const { supabase, rpc } = mockDigestionSupabase();
    const llm = digestionLlm(
      vi.fn(async () => {
        throw new Error("provider exploded");
      }) as unknown as LlmProvider["generateStructured"],
    );

    await runDigestionPass({ supabase, forTask: () => llm });

    expect(rpcNames(rpc)).toContain("increment_source_digestion_retry");
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
