import type { Digest } from "@nema-io/shared";
import { DIGEST_BODY_SCHEMAS_BY_TYPE } from "@nema-io/shared";

import { getEmbeddingProvider } from "@server/infra/embedding";
import type { DigestUpsertItem } from "@server/infra/vector";
import { getVectorStore } from "@server/infra/vector";

// DigestBody가 유형별 판별 유니언이라 필드 키가 유형마다 다르다 — 있는 칸만
// 문자열로 뽑는다. 모든 칸이 string | string[] | undefined이므로 캐스팅은
// key가 실제로 그 유형의 body 스키마에서 나온 값인 한 안전하다.
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

// 이 텍스트는 사람이 안 읽고 임베딩 모델 입력으로만 쓰인다 — 칸 이름을 그대로
// 라벨로 쓴다. 칸 목록은 DIGEST_BODY_SCHEMAS_BY_TYPE(정규화·클라이언트 표시가
// 보는 SSOT)에서 그대로 읽는다 — 손으로 옮겨 적은 목록이 없으니 필드가
// 늘거나 리네임돼도 이 자리가 어긋날 수 없다.
function buildEmbeddingText(digest: Digest): string {
  const parts = [`title: ${digest.title}`];
  const keys = Object.keys(DIGEST_BODY_SCHEMAS_BY_TYPE[digest.type].shape);
  for (const key of keys) {
    const text = fieldText(digest.body, key);
    if (text !== undefined) {
      parts.push(`${key}: ${text}`);
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
