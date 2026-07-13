import { describe, expect, it } from "vitest";

import {
  CHUNK_CONTEXT_WINDOW_TOKENS,
  chunkForExtraction,
  countTokens,
  EXTRACTION_CHUNK_THRESHOLD_TOKENS,
} from "./chunking";

// 합성 장문 — 문단(빈 줄)·문장 경계가 모두 있는 회의록 결.
// 문장마다 고유 번호를 박아 무손실·순서 검증이 문자열 비교로 가능하게 한다.
const SENTENCES_PER_PARAGRAPH = 5;
// 문맥 창은 문장 경계 정렬로 예산을 한 문장만큼 넘을 수 있다 — 허용 배율
const CONTEXT_BUDGET_TOLERANCE_FACTOR = 2;
// 균등 패킹 경로에서 가장 작은 청크가 가장 큰 청크의 이 비율 이상이어야 한다
// (꼬투리 청크 방지 — 설계 3장). 실측 변동은 ~1%라 0.5는 넉넉한 회귀 가드.
const MIN_CHUNK_BALANCE_RATIO = 0.5;
// 아래 비균등 경계 테스트는 실제 BPE 토크나이저(js-tiktoken)로 여러 후보 경계를
// 반복 재측정해 로컬에서도 ~3.4초 걸린다 — CI 공유 러너는 기본 5초 제한을 자주
// 넘겨 타임아웃(로직 실패 아님)이 났다. 계산량 자체를 줄이는 게 아니라 여유를 둔다.
const SKEWED_BOUNDARY_TEST_TIMEOUT_MS = 15_000;

function buildParagraphText(sentenceCount: number): string {
  const paragraphs: string[] = [];
  for (let p = 0; p * SENTENCES_PER_PARAGRAPH < sentenceCount; p++) {
    const sentences: string[] = [];
    for (
      let s = p * SENTENCES_PER_PARAGRAPH;
      s < Math.min((p + 1) * SENTENCES_PER_PARAGRAPH, sentenceCount);
      s++
    ) {
      sentences.push(
        `${s}번째 논의에서 배포 파이프라인의 캐시 무효화 정책을 검토했고 결론은 문서에 적었다.`,
      );
    }
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs.join("\n\n");
}

describe("chunkForExtraction", () => {
  it("임계선 이하 입력은 분할 없이 원문 1청크 — 기존 1콜 경로가 절대 안 바뀐다", () => {
    const body = buildParagraphText(10);
    expect(countTokens(body)).toBeLessThanOrEqual(
      EXTRACTION_CHUNK_THRESHOLD_TOKENS,
    );

    const chunks = chunkForExtraction(body);
    expect(chunks).toEqual([{ body, contextBefore: null, contextAfter: null }]);
  });

  it("임계선 초과 입력은 무손실 분할 — 본문을 이으면 원문, 청크마다 임계선 이하", () => {
    const body = buildParagraphText(200);
    expect(countTokens(body)).toBeGreaterThan(
      EXTRACTION_CHUNK_THRESHOLD_TOKENS,
    );

    const chunks = chunkForExtraction(body);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.body).join("")).toBe(body);
    const sizes = chunks.map((c) => countTokens(c.body));
    for (const size of sizes) {
      expect(size).toBeLessThanOrEqual(EXTRACTION_CHUNK_THRESHOLD_TOKENS);
    }
    // 균등 입력은 안전망(splitOversized) 미발동 → packEvenly의 균등 분배가 성립.
    // 마지막 청크만 극단적으로 작아지는 꼬투리 회귀를 잡는다 (설계 3장).
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(
      Math.max(...sizes) * MIN_CHUNK_BALANCE_RATIO,
    );
  });

  it("문단(빈 줄) 경계가 있으면 거기서 자른다 — 문장 중간 절단 없음", () => {
    const body = buildParagraphText(200);
    const chunks = chunkForExtraction(body);

    for (const chunk of chunks.slice(0, -1)) {
      // 문단 경계 컷이면 본문이 빈 줄로 끝난다
      expect(chunk.body).toMatch(/\n[ \t]*\n+$/);
    }
  });

  it("문단이 없는 글은 문장 경계로 강등해 자른다", () => {
    const body = buildParagraphText(200).replaceAll("\n\n", " ");
    const chunks = chunkForExtraction(body);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.body).join("")).toBe(body);
    for (const chunk of chunks.slice(0, -1)) {
      // 문장 경계 컷이면 종결 부호+공백으로 끝난다
      expect(chunk.body).toMatch(/\.\s+$/);
    }
  });

  it(
    "비균등 경계 입력에서도 모든 청크(꼬리 포함)가 임계선 이하 — 추정 오차·잔차 안전망",
    () => {
      // 균등 문단(buildParagraphText)은 추정 오차·잔차 누적을 못 드러낸다. 문단 길이를
      // 바꿔가며 경계 간격을 비균등으로 만들면 비종단·꼬리 청크가 임계선을 넘던 회귀.
      const sentence =
        "배포 파이프라인의 캐시 무효화 정책을 재검토했고 결론은 위키에 정리하기로 했다 ";
      const buildSkewed = (paraLen: number, paraCount: number): string => {
        const para = sentence
          .repeat(Math.ceil(paraLen / sentence.length))
          .slice(0, paraLen);
        return Array.from(
          { length: paraCount },
          (_, i) => `${i}번 ${para}`,
        ).join("\n\n");
      };

      // [650,60]은 안전망 없을 때 9청크가 초과하던 최강 회귀 케이스, [800,30]은 다른 모양
      for (const [paraLen, paraCount] of [
        [650, 60],
        [800, 30],
      ] as const) {
        const body = buildSkewed(paraLen, paraCount);
        const chunks = chunkForExtraction(body);
        expect(chunks.map((c) => c.body).join("")).toBe(body);
        for (const chunk of chunks) {
          expect(countTokens(chunk.body)).toBeLessThanOrEqual(
            EXTRACTION_CHUNK_THRESHOLD_TOKENS,
          );
        }
      }
    },
    SKEWED_BOUNDARY_TEST_TIMEOUT_MS,
  );

  it("경계가 전무한 한 덩어리도 하드 컷으로 무손실 분할된다", () => {
    // 공백·구두점 없는 연속 텍스트 (최악 입력)
    const body = "가나다라마바사아자차카타파하".repeat(500);
    const chunks = chunkForExtraction(body);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.body).join("")).toBe(body);
  });

  it("같은 입력은 항상 같은 분할 — 결정성 (절단 원칙 4의 분할기 버전)", () => {
    const body = buildParagraphText(300);
    expect(chunkForExtraction(body)).toEqual(chunkForExtraction(body));
  });

  it("문맥 창: 앞 청크 꼬리·다음 청크 머리가 원문 그대로, 예산 근처로 잘린다", () => {
    const body = buildParagraphText(300);
    const chunks = chunkForExtraction(body);
    expect(chunks.length).toBeGreaterThan(2);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }
      if (i === 0) {
        expect(chunk.contextBefore).toBeNull();
      } else {
        // 앞 청크 본문의 꼬리와 정확히 일치 (요약·변형 없음)
        const prev = chunks[i - 1];
        expect(prev?.body.trimEnd().endsWith(chunk.contextBefore ?? "")).toBe(
          true,
        );
        // 예산 + 문장 정렬 여유 안쪽
        expect(countTokens(chunk.contextBefore ?? "")).toBeLessThanOrEqual(
          CHUNK_CONTEXT_WINDOW_TOKENS * CONTEXT_BUDGET_TOLERANCE_FACTOR,
        );
      }
      if (i === chunks.length - 1) {
        expect(chunk.contextAfter).toBeNull();
      } else {
        const next = chunks[i + 1];
        expect(
          next?.body.trimStart().startsWith(chunk.contextAfter ?? ""),
        ).toBe(true);
        expect(countTokens(chunk.contextAfter ?? "")).toBeLessThanOrEqual(
          CHUNK_CONTEXT_WINDOW_TOKENS * CONTEXT_BUDGET_TOLERANCE_FACTOR,
        );
      }
    }
  });
});
