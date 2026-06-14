// 초장문 분할기 — 임계선을 넘는 입력을 추출 청크로 가른다.
// 설계: docs/flows/save-engine-v2/long-input-chunking.md 2~4장.
//
// 순수 함수·결정적(같은 입력 → 항상 같은 분할). 절단("하나의 '왜'")은 LLM의
// 일이고, 분할기의 책임은 '왜' 하나가 걸쳐 있을 확률이 낮은 경계를 고르는 것 —
// 문단 → 줄바꿈 → 문장 부호 순으로 강등하며 균등 크기 근처의 경계를 찾는다.
// 경계 품질이 측정에서 미달하면 이 모듈만 교체한다(설계 3장의 퇴로).

import { getEncoding } from "js-tiktoken";

/** 분할 발동 임계선 = 청크 목표 크기 (설계 2장 — 곡선 측정 #5에서 역산) */
export const EXTRACTION_CHUNK_THRESHOLD_TOKENS = 1_500;
/** 이웃 청크에서 동봉하는 읽기 전용 문맥의 토큰 예산 (설계 4장, 보정 대상) */
export const CHUNK_CONTEXT_WINDOW_TOKENS = 200;
/** 균등 분배 목표 지점에서 경계를 탐색하는 반경 — 못 찾으면 한 단계 강등 */
const BOUNDARY_SEARCH_WINDOW_TOKENS = 200;

// gpt-5 계열 인코딩 고정 — 모델이 바뀌면 임계선 곡선 자체를 재측정해야 하므로
// (설계 7장) 인코딩만 바꾸는 일은 없다
const encoder = getEncoding("o200k_base");

// BPE는 공백·구두점 없는 연속 문자열(해시·base64류)에서 제곱 시간으로 느려진다
// (실측: 비단절 5,600자 = 14초, 일반 텍스트 6,400자 = 11ms). 인코딩 입력을
// 조각으로 묶어 상한을 건다 — 조각 경계는 공백을 우선해 일반 텍스트의 토큰 수
// 오차를 없애고, 비단절 구간만 강제 절단된다(±몇 토큰, 패킹 정밀도엔 무관).
//
// 총 인코딩 시간은 입력 길이에 선형이고 조각 크기에 비례한다(작업량 ∝ N×조각).
// 120은 비단절 7,000자를 1.3초→0.36초로 줄이면서(CI 사양 5초 안), 토큰 수
// 오차는 +0.6%로 패킹 마진 안. 정상 텍스트는 공백에서 끊겨 오차·속도 영향 없음.
const ENCODE_SLICE_CHARS = 120;
const SLICE_WHITESPACE_LOOKBACK_CHARS = 100;

function encodeBounded(text: string): number[] {
  if (text.length <= ENCODE_SLICE_CHARS) {
    return encoder.encode(text);
  }
  const tokens: number[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + ENCODE_SLICE_CHARS, text.length);
    if (end < text.length) {
      const lookbackStart = Math.max(
        pos + 1,
        end - SLICE_WHITESPACE_LOOKBACK_CHARS,
      );
      for (let i = end - 1; i >= lookbackStart; i--) {
        if (/\s/.test(text[i] ?? "")) {
          end = i + 1;
          break;
        }
      }
    }
    tokens.push(...encoder.encode(text.slice(pos, end)));
    pos = end;
  }
  return tokens;
}

export interface ExtractionChunk {
  /** 추출 대상 본문 — 청크끼리 한 글자도 안 겹친다 (이어붙이면 원문) */
  body: string;
  /** 앞 청크의 꼬리 (대명사·생략 해소용, 추출 금지) — 첫 청크는 null */
  contextBefore: string | null;
  /** 다음 청크의 머리 (경계 직후 번복 등 시야 복원용, 추출 금지) — 끝 청크는 null */
  contextAfter: string | null;
}

export function countTokens(text: string): number {
  return encodeBounded(text).length;
}

/**
 * 임계선 이하면 [원문 1청크, 문맥 null] — 호출자는 현행 1콜 경로 그대로.
 * 초과하면 균등 패킹된 청크 목록 — 본문을 전부 이으면 원문과 동일(무손실).
 */
export function chunkForExtraction(body: string): ExtractionChunk[] {
  const totalTokens = countTokens(body);
  if (totalTokens <= EXTRACTION_CHUNK_THRESHOLD_TOKENS) {
    return [{ body, contextBefore: null, contextAfter: null }];
  }

  const bodies = splitIntoBodies(body, totalTokens);
  const chunks: ExtractionChunk[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const prev = i > 0 ? bodies[i - 1] : undefined;
    const next = i < bodies.length - 1 ? bodies[i + 1] : undefined;
    chunks.push({
      body: bodies[i] ?? "",
      contextBefore: prev !== undefined ? tailContext(prev) : null,
      contextAfter: next !== undefined ? headContext(next) : null,
    });
  }
  return chunks;
}

// --- 경계 후보 ---

/** 숫자가 클수록 좋은 경계: 3=문단(빈 줄), 2=줄바꿈, 1=문장 부호 */
type BoundaryLevel = 3 | 2 | 1;

interface BoundaryCandidate {
  /** 원문 문자 오프셋 — 이 앞에서 자른다 */
  charIndex: number;
  /** 원문 시작부터 이 지점까지의 토큰 수 */
  tokenIndex: number;
  level: BoundaryLevel;
}

const PARAGRAPH_RE = /\n[ \t]*\n+/g;
const NEWLINE_RE = /\n/g;
// 종결 부호(+닫는 따옴표·괄호) 뒤 공백 — 다음 문장 시작 직전에서 자른다
const SENTENCE_RE = /[.!?。…!?]["')\]」』]*\s+/g;

function collectCandidates(body: string): BoundaryCandidate[] {
  // charIndex → level (같은 지점이면 높은 레벨이 이긴다)
  const byChar = new Map<number, BoundaryLevel>();

  const collect = (re: RegExp, level: BoundaryLevel) => {
    for (const match of body.matchAll(re)) {
      const cut = match.index + match[0].length;
      if (cut <= 0 || cut >= body.length) {
        continue;
      }
      const existing = byChar.get(cut);
      if (existing === undefined || existing < level) {
        byChar.set(cut, level);
      }
    }
  };
  collect(PARAGRAPH_RE, 3);
  collect(NEWLINE_RE, 2);
  collect(SENTENCE_RE, 1);

  const sorted = [...byChar.entries()].sort(([a], [b]) => a - b);

  // 후보 사이 구간을 각각 인코딩해 누적 토큰 위치를 단다.
  // 구간별 인코딩 합은 전체 인코딩과 BPE 병합 차이로 몇 토큰 어긋날 수 있지만,
  // 임계선 자체가 마진을 갖고 역산된 값이라 패킹 정밀도로 충분하다.
  const candidates: BoundaryCandidate[] = [];
  let prevChar = 0;
  let cumTokens = 0;
  for (const [charIndex, level] of sorted) {
    cumTokens += countTokens(body.slice(prevChar, charIndex));
    prevChar = charIndex;
    candidates.push({ charIndex, tokenIndex: cumTokens, level });
  }
  return candidates;
}

// --- 균등 패킹 (설계 3장) ---

function splitIntoBodies(body: string, totalTokens: number): string[] {
  const chunkCount = Math.ceil(totalTokens / EXTRACTION_CHUNK_THRESHOLD_TOKENS);
  const candidates = collectCandidates(body);

  // 경계가 아예 없는 입력(비단절 덩어리)은 토큰 균등 하드 컷 한 번으로 끝낸다
  // — 루프의 청크별 재인코딩을 피한다 (비단절은 인코딩이 가장 비싼 입력이다)
  if (candidates.length === 0) {
    return evenTokenSplit(body, chunkCount);
  }

  const bodies: string[] = [];
  let cursorChar = 0;
  let cursorTokens = 0;

  for (let i = 0; i < chunkCount - 1; i++) {
    const remainingChunks = chunkCount - i;
    const ideal = cursorTokens + (totalTokens - cursorTokens) / remainingChunks;
    // 임계선 보장: 탐색 상한이 cursor+THRESHOLD를 넘지 않는다
    const high = Math.min(
      ideal + BOUNDARY_SEARCH_WINDOW_TOKENS,
      cursorTokens + EXTRACTION_CHUNK_THRESHOLD_TOKENS,
    );
    const low = Math.max(
      ideal - BOUNDARY_SEARCH_WINDOW_TOKENS,
      cursorTokens + 1,
    );

    const cut = pickBoundary({ candidates, low, high, ideal });
    if (cut) {
      bodies.push(body.slice(cursorChar, cut.charIndex));
      cursorChar = cut.charIndex;
      cursorTokens = cut.tokenIndex;
    } else {
      // 최후 수단: 탐색 창에 경계가 전무 — 문자 위치 하드 컷.
      // 토큰 decode 기반 컷은 토큰 경계가 멀티바이트 문자를 가를 수 있어
      // 무손실이 깨진다 — 문자 비례 추정으로 자른다(토큰 수 오차 ±몇 %는
      // 임계선 마진 안).
      const rest = body.slice(cursorChar);
      const restTokens = countTokens(rest);
      const take = Math.round(ideal - cursorTokens);
      const pieceChars = Math.max(
        1,
        Math.round((rest.length * take) / restTokens),
      );
      bodies.push(rest.slice(0, pieceChars));
      cursorChar += pieceChars;
      cursorTokens += take;
    }
  }
  bodies.push(body.slice(cursorChar));
  return bodies;
}

/** 경계 없는 입력 전용 — 문자 균등 분할 (균일한 비단절 덩어리라 토큰 균등과 동치) */
function evenTokenSplit(body: string, chunkCount: number): string[] {
  const per = Math.ceil(body.length / chunkCount);
  const bodies: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    bodies.push(body.slice(i * per, (i + 1) * per));
  }
  return bodies.filter((b) => b.length > 0);
}

function pickBoundary(params: {
  candidates: BoundaryCandidate[];
  low: number;
  high: number;
  ideal: number;
}): BoundaryCandidate | null {
  const { candidates, low, high, ideal } = params;
  const inWindow = candidates.filter(
    (c) => c.tokenIndex >= low && c.tokenIndex <= high,
  );
  if (inWindow.length === 0) {
    return null;
  }
  // 레벨 우선(문단 > 줄바꿈 > 문장), 같은 레벨이면 목표 지점에 가까운 쪽,
  // 그래도 같으면 앞쪽 — 전부 결정적 비교라 분할이 결정적이다
  return inWindow.reduce((best, c) => {
    if (c.level !== best.level) {
      return c.level > best.level ? c : best;
    }
    const dc = Math.abs(c.tokenIndex - ideal);
    const db = Math.abs(best.tokenIndex - ideal);
    if (dc !== db) {
      return dc < db ? c : best;
    }
    return best;
  });
}

// --- 읽기 전용 문맥 창 (설계 4장) ---

/** 앞 청크의 꼬리 — 문장 경계 정렬, 경계가 없으면 토큰 하드 컷 */
function tailContext(prevBody: string): string {
  const candidates = collectCandidates(prevBody);
  const totalTokens = countTokens(prevBody);
  const budgetStart = totalTokens - CHUNK_CONTEXT_WINDOW_TOKENS;

  // 예산 안에 들어오는 가장 이른 문장 시작점
  const start = candidates.find((c) => c.tokenIndex >= budgetStart);
  if (start) {
    return prevBody.slice(start.charIndex).trim();
  }
  // 경계가 없으면(한 덩어리 꼬리) 토큰 하드 컷
  const tokens = encodeBounded(prevBody);
  return encoder
    .decode(
      tokens.slice(Math.max(0, tokens.length - CHUNK_CONTEXT_WINDOW_TOKENS)),
    )
    .trim();
}

/** 다음 청크의 머리 — 문장 경계 정렬, 첫 문장이 예산을 넘으면 토큰 하드 컷 */
function headContext(nextBody: string): string {
  const candidates = collectCandidates(nextBody);

  // 예산 안에 들어오는 가장 늦은 문장 끝점
  let end: BoundaryCandidate | null = null;
  for (const c of candidates) {
    if (c.tokenIndex <= CHUNK_CONTEXT_WINDOW_TOKENS) {
      end = c;
    } else {
      break;
    }
  }
  if (end) {
    return nextBody.slice(0, end.charIndex).trim();
  }
  // 첫 문장이 예산보다 길면 토큰 하드 컷
  const tokens = encodeBounded(nextBody);
  return encoder.decode(tokens.slice(0, CHUNK_CONTEXT_WINDOW_TOKENS)).trim();
}
