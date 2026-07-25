import { useParams } from "@tanstack/react-router";

// Space 스코프 화면들이 쓰는 식별자 — 라우트 상태라 컴포넌트 사이로 넘길 필요가 없다.
//
// from으로 라우트를 못박으면 파라미터가 string으로 딱 떨어지지만 그 라우트 하나에만
// 묶인다 — Space 아래 화면은 여럿이고(스레드 탭·변경셋 탭) 앞으로 더 늘어난다.
// strict: false로 열어두고 없을 때 throw해서, 공개 타입은 그대로 string으로 유지하되
// Space 라우트 어디서든 쓸 수 있게 한다.
export function useSpacePublicId(): string {
  const { spacePublicId } = useParams({ strict: false });

  if (!spacePublicId) {
    throw new Error(
      "useSpacePublicId must be used under a /space/$spacePublicId route.",
    );
  }

  return spacePublicId;
}
