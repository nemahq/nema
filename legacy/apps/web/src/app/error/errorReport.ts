const SHORT_SHA_LENGTH = 7;

interface BuildErrorReportInput {
  error: Error;
  route: string;
  timestamp: string;
  eventId?: string;
  componentStack?: string;
}

// 토큰·쿠키·요청 바디는 애초에 조합 대상이 아니다. route는 호출부가 항상
// pathname(location.pathname)만 넘겨 쿼리스트링·해시가 섞일 여지가 없다 —
// error.message 자체는 서버가 던진 원문이 그대로 올 수 있어(예: TRPCClientError)
// 이 함수가 그 내용까지 보장하진 않는다.
export function buildErrorReport({
  error,
  route,
  timestamp,
  eventId,
  componentStack,
}: BuildErrorReportInput): string {
  const lines = [
    `[Error] ${error.name}: ${error.message}`,
    eventId && `Event ID: ${eventId}`,
    `Route: ${route}`,
    `App Version: ${getAppVersion()}`,
    `Browser: ${navigator.userAgent}`,
    `Time: ${timestamp}`,
  ].filter((line): line is string => Boolean(line));

  if (componentStack) {
    lines.push("", "Component Stack:", componentStack.trim());
  }
  if (error.stack) {
    lines.push("", "Stack Trace:", error.stack);
  }

  return lines.join("\n");
}

export function getAppVersion(): string {
  if (typeof __COMMIT_SHA__ === "undefined" || __COMMIT_SHA__ === "dev") {
    return "dev";
  }
  return __COMMIT_SHA__.slice(0, SHORT_SHA_LENGTH);
}
