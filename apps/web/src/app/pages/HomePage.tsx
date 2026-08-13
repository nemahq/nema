import { useNavigate, useSearch } from "@tanstack/react-router";

import { DigestListScreen } from "@web/features/digest";

// 열려 있는 상세를 URL search param에 둔다 — 새로고침·링크 공유로 같은 상세가
// 다시 열리고, 뒤로가기가 패널 닫기가 된다(초안 화면과 같은 규칙).
export function HomePage() {
  const { digest, source } = useSearch({ from: "/_authenticated/" });
  const navigate = useNavigate();

  function handleSelectDigest(digestId: string | null) {
    void navigate({ to: "/", search: digestId ? { digest: digestId } : {} });
  }

  function handleSelectSource(sourceId: string | null) {
    void navigate({ to: "/", search: sourceId ? { source: sourceId } : {} });
  }

  return (
    <DigestListScreen
      selectedDigestId={digest ?? null}
      selectedSourceId={source ?? null}
      onSelectDigest={handleSelectDigest}
      onSelectSource={handleSelectSource}
    />
  );
}
