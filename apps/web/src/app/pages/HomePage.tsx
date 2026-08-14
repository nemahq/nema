import { useNavigate, useSearch } from "@tanstack/react-router";

import { DigestListScreen } from "@web/features/digest";

// 열려 있는 상세를 URL search param에 둔다 — 새로고침·링크 공유로 같은 상세가
// 다시 열리고, 뒤로가기가 패널 닫기가 된다(초안 화면과 같은 규칙).
export function HomePage() {
  const { digest, source } = useSearch({ from: "/_authenticated/" });
  const navigate = useNavigate();

  // 다이제스트를 "여는" 경로는 DigestListRow의 Link가 URL을 직접 바꾸므로,
  // 이 페이지가 다루는 건 닫기뿐이다.
  function handleCloseDigest() {
    void navigate({ to: "/", search: {} });
  }

  function handleSelectSource(sourceId: string | null) {
    void navigate({ to: "/", search: sourceId ? { source: sourceId } : {} });
  }

  return (
    <DigestListScreen
      selectedDigestId={digest ?? null}
      selectedSourceId={source ?? null}
      onCloseDigest={handleCloseDigest}
      onSelectSource={handleSelectSource}
    />
  );
}
