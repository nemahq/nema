import { useEffect } from "react";

// 이 쿼리는 자동 재조회 축을 모두 껐다(useDigestReviewQuery 참고) — 그 대신 창
// 포커스 복귀를 직접 감지해 "펜딩(미저장) 편집이 없을 때만" 명시적으로 refetch한다.
// 펜딩 중이면 서버 재조회가 아직 반영 안 된 편집을 덮어쓸 수 있어 건너뛴다.
export function useRefetchReviewOnFocus(
  refetch: () => void,
  hasPendingEdits: () => boolean,
) {
  useEffect(
    function refetchOnWindowFocus() {
      function handleFocus() {
        if (!hasPendingEdits()) {
          refetch();
        }
      }
      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    },
    [refetch, hasPendingEdits],
  );
}
