import type { DigestBody } from "@nema-io/shared";

import type {
  DigestBodyFieldKey,
  DigestBodyFieldKind,
} from "@web/features/review/constants";

// DIGEST_BODY_FIELDS의 key는 body.type과의 상관관계가 렌더 시점에 끊겨 string으로
// 넓어진다 — 단언 대신 실제 값 모양을 확인해 좁힌다. 편집(DigestBodyField)·읽기전용
// (DigestReadonlyBodyFields) 양쪽이 같은 body 유니온을 같은 방식으로 읽어야 해서 공유한다.
export function readDigestBodyFieldValue(
  body: DigestBody,
  key: DigestBodyFieldKey,
): string | string[] | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    return raw;
  }
  return undefined;
}

// 리스트 필드는 한 번 타이핑했다 다 지우면 [""](빈 항목 1개)로 남는다 — length만
// 보면 이 상태를 "값 있음"으로 오판한다.
export function isDigestBodyFieldBlank(value: string | string[]): boolean {
  if (typeof value === "string") {
    return value.trim() === "";
  }
  return value.every((item) => item.trim() === "");
}

// 빈 string[] 필드는 []로는 타이핑을 시작할 줄 자체가 없어 [""] 하나를 깔아준다.
// 실제로 치기 전까진 초안에 넘기지 않아 서버로 나가는 값은 그대로 비어 있다.
const EMPTY_VALUE: Record<DigestBodyFieldKind, string | string[]> = {
  text: "",
  list: [""],
};

// 값이 진짜 없을 때(undefined·빈 배열)만 자리를 깔아준다 — 이미 자리가 있는
// 값(예: "   ", ["", ""])까지 모양을 바꾸면, 그 값을 커밋한 useDraftField가
// 다음 렌더에서 받는 committed가 자신이 방금 커밋한 값과 달라져 "바깥에서
// 바뀌었다"로 오판하고 그 사이 타이핑을 덮어쓴다.
export function resolveCommittedValue(
  stored: string | string[] | undefined,
  kind: DigestBodyFieldKind,
): string | string[] {
  if (stored === undefined) {
    return EMPTY_VALUE[kind];
  }
  if (Array.isArray(stored) && stored.length === 0) {
    return EMPTY_VALUE[kind];
  }
  return stored;
}
