import type { Digest, DigestType } from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { DigestUpsertItem } from "@server/infra/vector";
import { getVectorStore } from "@server/infra/vector";

// 유형별 body 칸 키만 허용 — 스키마 필드가 리네임돼도 이 표가 조용히 어긋나지
// 않고 컴파일 에러로 걸린다.
type DigestOfType<T extends DigestType> = Extract<Digest, { type: T }>;
type FieldSpec<T extends DigestType> = {
  key: keyof DigestOfType<T>["body"];
  label: string;
};

// 임베딩 텍스트 조립 전용 필드 라벨 — eval/digest-engine/format.ts의 표시용 라벨과는
// 목적이 다르다(화면·리뷰 vs 벡터 텍스트). 라벨 문구는 콘텐츠 언어와 무관하게
// 고정해도 된다 — 모든 다이제스트에 공통이라 벡터 거리에서 서로 상쇄된다.
const EMBEDDING_FIELD_LABELS: { [T in DigestType]: FieldSpec<T>[] } = {
  decision: [
    { key: "situation", label: "상황" },
    { key: "choice", label: "선택" },
    { key: "reason", label: "이유" },
    { key: "tradeoff", label: "트레이드오프" },
    { key: "alternatives", label: "대안" },
  ],
  pending: [
    { key: "question", label: "질문" },
    { key: "background", label: "배경" },
    { key: "branches", label: "갈래" },
    { key: "resolutionCondition", label: "해소 조건" },
  ],
  learning: [
    { key: "finding", label: "발견" },
    { key: "evidence", label: "근거" },
  ],
  idea: [
    { key: "concept", label: "발상" },
    { key: "background", label: "배경" },
    { key: "branches", label: "갈래" },
  ],
  assumption: [
    { key: "assumption", label: "가정" },
    { key: "evidence", label: "근거" },
    { key: "impact", label: "영향" },
    { key: "verificationCondition", label: "검증 조건" },
  ],
};

// DigestBody가 유형별 판별 유니언이라 필드 키가 유형마다 다르다 — 라벨 표를 훑으며
// 있는 칸만 문자열로 뽑는다. 모든 칸이 string | string[] | undefined이므로 캐스팅은
// 이 표의 키 목록이 실제 body 모양과 어긋나지 않는 한 안전하다.
function fieldText(body: Digest["body"], key: string): string | undefined {
  const fieldValue = (body as Record<string, string | string[] | undefined>)[
    key
  ];
  if (fieldValue === undefined) {
    return undefined;
  }
  const text = Array.isArray(fieldValue) ? fieldValue.join(", ") : fieldValue;
  return text.length > 0 ? text : undefined;
}

function buildEmbeddingText(digest: Digest): string {
  const parts = [`제목: ${digest.title}`];
  for (const { key, label } of EMBEDDING_FIELD_LABELS[digest.type]) {
    const text = fieldText(digest.body, key);
    if (text !== undefined) {
      parts.push(`${label}: ${text}`);
    }
  }
  return parts.join(" / ");
}

export async function indexDigests(args: {
  userId: string;
  digests: Digest[];
}): Promise<void> {
  const { userId, digests } = args;
  if (digests.length === 0) {
    return;
  }

  const items: DigestUpsertItem[] = digests.map((digest) => ({
    digestId: digest.id,
    userId,
    text: buildEmbeddingText(digest),
    createdAt: digest.createdAt,
  }));

  // 원문 하나에서 다이제스트가 n개 나와도 임베딩 1회 + 색인 1회다 — upsertDigests가
  // items 전체를 한 번에 배치로 묻는다.
  await getVectorStore().upsertDigests(getEmbeddingProvider(), items);
}

// 삭제·재추출로 Postgres에서 지워진 digest의 벡터를 없앤다. 실패해도 던지지 않고
// 경고만 남긴다 — 이미 끝난 Postgres 쪽 작업(삭제·재추출)을 벡터 정리 실패로
// 되돌리면 사용자에게 더 나쁘다(고아 벡터 하나 남는 것보다 "삭제했는데 안 지워졌다"는
// 게 더 혼란스럽다). 경고는 로그로 남아 드리프트가 조용히 묻히지 않는다.
export async function deleteDigestVectors(digestIds: string[]): Promise<void> {
  if (digestIds.length === 0) {
    return;
  }
  try {
    await getVectorStore().deleteDigests(digestIds);
  } catch (error) {
    console.warn(
      `[digest-index] 벡터 삭제 실패 — digest_id ${digestIds.length}개가 Qdrant에 고아로 남을 수 있음:`,
      error,
    );
  }
}
