import { describe, expect, it } from "vitest";

import {
  CHUNK_CONTEXT_WINDOW_TOKENS,
  chunkForExtraction,
  countTokens,
  EXTRACTION_CHUNK_THRESHOLD_TOKENS,
} from "./chunking";

// 합성 장문 — 문단(빈 줄)·문장 경계가 모두 있는 회의록 결.
// 문장마다 고유 번호를 박아 무손실·순서 검증이 문자열 비교로 가능하게 한다.
function buildParagraphText(sentenceCount: number): string {
  const paragraphs: string[] = [];
  for (let p = 0; p * 5 < sentenceCount; p++) {
    const sentences: string[] = [];
    for (let s = p * 5; s < Math.min((p + 1) * 5, sentenceCount); s++) {
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
    for (const chunk of chunks) {
      expect(countTokens(chunk.body)).toBeLessThanOrEqual(
        EXTRACTION_CHUNK_THRESHOLD_TOKENS,
      );
    }
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
          CHUNK_CONTEXT_WINDOW_TOKENS * 2,
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
          CHUNK_CONTEXT_WINDOW_TOKENS * 2,
        );
      }
    }
  });
});
