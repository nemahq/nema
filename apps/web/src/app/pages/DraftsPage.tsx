import { useNavigate, useSearch } from "@tanstack/react-router";

import { DraftsScreen } from "@web/features/drafts";

// 열려 있는 초안 상세를 URL search param에 둔다 — 새로고침·링크 공유로 같은
// 상세가 다시 열리고, 뒤로가기가 패널 닫기가 된다.
export function DraftsPage() {
  const { source } = useSearch({ from: "/_authenticated/drafts" });
  const navigate = useNavigate();

  function handleSelectSource(sourcePublicId: string | null) {
    void navigate({
      to: "/drafts",
      search: sourcePublicId ? { source: sourcePublicId } : {},
    });
  }

  return (
    <DraftsScreen
      selectedSourcePublicId={source ?? null}
      onSelectSource={handleSelectSource}
    />
  );
}
