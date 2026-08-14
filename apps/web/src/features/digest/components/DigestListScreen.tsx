import { NavigationBar } from "@web/components/layout/NavigationBar";
import { SidePanel } from "@web/components/ui/SidePanel";
import { SourceDetailPanel } from "@web/features/source";
import { useTranslation } from "@web/lib/tolgee";

import { DigestDetailPanel } from "./DigestDetailPanel";
import { DigestListBody } from "./DigestListBody";

interface DigestListScreenProps {
  selectedDigestId: string | null;
  selectedSourceId: string | null;
  // 행이 Link로 바뀌면서 다이제스트를 "여는" 경로는 URL 내비게이션이 도맡는다 —
  // 이 화면이 스스로 트리거하는 건 닫기뿐이라 string | null이 아니라 닫기 전용
  // 시그니처로 좁힌다.
  onCloseDigest: () => void;
  onSelectSource: (sourceId: string | null) => void;
}

export function DigestListScreen({
  selectedDigestId,
  selectedSourceId,
  onCloseDigest,
  onSelectSource,
}: DigestListScreenProps) {
  const { t } = useTranslation();

  function handleCloseSource() {
    onSelectSource(null);
  }

  return (
    <main className="flex min-w-0 flex-1 bg-surface-card">
      <div className="flex min-w-0 flex-1 flex-col">
        <NavigationBar items={[{ label: t("digest.nav_label") }]} />
        <DigestListBody
          selectedDigestId={selectedDigestId}
          onSelectSource={onSelectSource}
        />
      </div>

      {/* 다이제스트와 원문이 사이드뷰 한 자리를 나눠 쓴다 — URL이 둘 중 하나만
          담으므로 여기서도 다이제스트를 먼저 보고 없으면 원문을 본다. */}
      {selectedDigestId !== null && (
        <SidePanel boundaryName="digest-detail" onClose={onCloseDigest}>
          <DigestDetailPanel
            digestId={selectedDigestId}
            onClose={onCloseDigest}
          />
        </SidePanel>
      )}
      {selectedDigestId === null && selectedSourceId !== null && (
        <SidePanel boundaryName="source-detail" onClose={handleCloseSource}>
          <SourceDetailPanel
            sourceId={selectedSourceId}
            onClose={handleCloseSource}
          />
        </SidePanel>
      )}
    </main>
  );
}
