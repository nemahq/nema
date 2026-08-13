// 서버 buildSourceName(source-service.ts)과 같은 규칙 — 제목 칸이 아직 없어
// 본문 앞부분으로 이름을 대신한다. source.get 응답엔 name이 없다(목록 전용
// 필드라 source.list/listWithDigests만 내려준다) — 상세 패널은 본문에서 직접
// 뽑는다. 규칙이 바뀌면 두 곳을 함께 맞춰야 한다.
const SOURCE_NAME_PREVIEW_LENGTH = 60;

export function sourceNamePreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= SOURCE_NAME_PREVIEW_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SOURCE_NAME_PREVIEW_LENGTH).trimEnd()}…`;
}
