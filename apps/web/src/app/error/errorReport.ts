const SHORT_SHA_LENGTH = 7;

interface BuildErrorReportInput {
  error: Error;
  eventId?: string;
  componentStack?: string;
}

// LLM에 그대로 붙여넣어도 원인 추적에 필요한 것만 담고, 토큰·쿠키·PII는
// 애초에 넣지 않는다 — Route는 pathname만(쿼리스트링 제외), 나머지는 전부
// 클라이언트 번들에 이미 노출돼 있는 정보(스택·버전·UA)뿐이다.
export function buildErrorReport({
  error,
  eventId,
  componentStack,
}: BuildErrorReportInput): string {
  const lines = [
    `[Error] ${error.name}: ${error.message}`,
    eventId && `Event ID: ${eventId}`,
    `Route: ${window.location.pathname}`,
    `App Version: ${getAppVersion()}`,
    `Browser: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
  ].filter((line): line is string => Boolean(line));

  if (componentStack) {
    lines.push("", "Component Stack:", componentStack.trim());
  }
  if (error.stack) {
    lines.push("", "Stack Trace:", error.stack);
  }

  return lines.join("\n");
}

function getAppVersion(): string {
  if (typeof __COMMIT_SHA__ === "undefined" || __COMMIT_SHA__ === "dev") {
    return "dev";
  }
  return __COMMIT_SHA__.slice(0, SHORT_SHA_LENGTH);
}
