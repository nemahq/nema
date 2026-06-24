export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 쉼표 구분 주제 입력 → 정규화 배열. 중복·공백은 떨어내고, 길이·개수 상한은 서버 zod가 강제한다.
export function parseTopics(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(",")) {
    const name = raw.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
  }
  return result;
}
