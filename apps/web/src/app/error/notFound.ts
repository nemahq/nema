import { notFound, rootRouteId } from "@tanstack/react-router";

/**
 * 앱 셸 밖, 루트 경계에서 렌더되는 전체 화면 404.
 * 중첩 레이아웃 안쪽에 갇히지 않게 하려면 raw `notFound()` 대신 이걸 사용한다.
 *
 * @lintignore 지금 이 라우트 트리에 beforeLoad에서 notFound를 던지는 라우트가
 * 없어 쓰는 곳이 없다 — dev 전용 라우트 등이 다시 생기면 가져다 쓴다.
 */
export function notFoundAtRoot() {
  return notFound({ routeId: rootRouteId });
}
