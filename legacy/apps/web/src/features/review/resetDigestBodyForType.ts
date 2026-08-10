import type { DigestBody, DigestType } from "@nema-io/shared";

// review-flow.md "타입 변경 시 필드 초기화" — DigestBodySchema의 타입별 필드가 전부
// optional이라 `{ type }`만으로 그 타입의 유효한 DigestBody가 된다. 이전 타입 전용
// 필드를 절대 들고 넘어가면 안 된다는 계약을 이 함수 하나로 강제한다.
export function resetDigestBodyForType(type: DigestType): DigestBody {
  return { type };
}
