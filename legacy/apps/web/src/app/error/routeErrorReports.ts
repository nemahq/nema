interface RouteErrorReport {
  eventId?: string;
  componentStack?: string;
}

// TanStack Router의 errorComponent는 componentStack을 넘겨주지 않고 Sentry
// 보고도 하지 않는다 — 실제 캡처는 React 19 root의 onCaughtError(main.tsx)
// 한 곳에서만 일어난다. 그 결과(eventId·componentStack)를 던져진 에러 객체
// 자체에 연결해두고, RouteErrorFallback이 같은 참조로 조회해 꺼내 쓴다.
const reports = new WeakMap<WeakKey, RouteErrorReport>();

export function recordRouteErrorReport(
  error: unknown,
  report: RouteErrorReport,
): void {
  if (typeof error === "object" && error !== null) {
    reports.set(error, report);
  }
}

export function getRouteErrorReport(
  error: unknown,
): RouteErrorReport | undefined {
  if (typeof error === "object" && error !== null) {
    return reports.get(error);
  }
  return undefined;
}
