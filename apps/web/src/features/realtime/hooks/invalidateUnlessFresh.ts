import type { QueryClient } from "@tanstack/react-query";

// "최근에 재조회했으면 건너뛴다"를 wall-clock 창(예: 2초)으로 재느냐 마느냐로
// 판정하면 안 된다 — sources UPDATE 디바운스처럼 실제 변경 여러 개를 한 번의
// 지연된 flush로 묶어 보내는 경로에서는, 그 flush 시점이 하필 "내 mutation이
// 직접 refetch한 시각"으로부터 몇 초 안에 들어와 버리면 이미 새로운 실제 변경
// (예: 정리 완료)까지 통째로 스킵된다("아직 신선함"이라는 판정이 틀렸는데도
// 시간만 보고 넘어감). Postgres CDC 이벤트 자체가 실려 오는 commit_timestamp
// (그 UPDATE/INSERT가 실제로 커밋된 시각)와 캐시의 dataUpdatedAt(마지막으로
// 성공한 재조회 시각)을 직접 비교하면, "이 변경이 있고 난 뒤에 이미 다시
// 읽었나"를 정확히 판정할 수 있다 — 그 사이 시간이 얼마나 지났는지는 상관없다.
//
// queryClient를 모듈 싱글턴으로 안 가져오고 인자로 받는다 — 싱글턴을 가져오면
// 그 모듈이 trpc·tolgee까지 줄줄이 물고 들어와 테스트가 앱 전체 환경변수
// 설정을 요구하게 된다(실측: VITE_API_URL 등). 순수 함수로 남겨 격리된
// QueryClient로도 테스트 가능하게 한다.
export function invalidateUnlessFresh(
  client: QueryClient,
  queryKey: readonly unknown[],
  changedAt: string,
) {
  const changedAtMs = new Date(changedAt).getTime();
  const queries = client.getQueryCache().findAll({ queryKey });
  const alreadyReflectsChange =
    queries.length > 0 &&
    queries.every((query) => query.state.dataUpdatedAt >= changedAtMs);
  if (alreadyReflectsChange) {
    return Promise.resolve();
  }
  return client.invalidateQueries({ queryKey });
}
