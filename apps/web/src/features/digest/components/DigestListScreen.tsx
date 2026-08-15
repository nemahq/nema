import { useState } from "react";

import type { DigestListItem, SourceWithDigests } from "@nema-io/shared";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { SidePanel } from "@web/components/ui/SidePanel";
import { SourceDetailPanel } from "@web/features/source";
import { useTranslation } from "@web/lib/tolgee";

import { DigestDetailPanel } from "./DigestDetailPanel";
import { DigestListBody } from "./DigestListBody";

interface DigestListScreenProps {
  selectedDigestPublicId: string | null;
  selectedSourcePublicId: string | null;
  // 행이 Link로 바뀌면서 다이제스트를 "여는" 경로는 URL 내비게이션이 도맡는다 —
  // 이 화면이 스스로 트리거하는 건 닫기뿐이라 string | null이 아니라 닫기 전용
  // 시그니처로 좁힌다.
  onCloseDigest: () => void;
  onSelectSource: (sourcePublicId: string | null) => void;
}

// 클릭으로 연 항목의 내부 id를 잠깐 들고 있는다 — 상세 헤더(삭제 버튼)가
// source.get/digest.get 응답을 기다리지 않고 바로 쓸 수 있게 한다
// (SourceDetailPanel·DigestDetailPanel의 knownId 참고). URL(publicId)과
// 짝이 안 맞으면(다른 항목으로 이동, 새로고침) 쓰지 않는다 — publicId도
// 함께 저장해 매번 대조한다.
interface KnownId {
  publicId: string;
  id: string;
}

export function DigestListScreen({
  selectedDigestPublicId,
  selectedSourcePublicId,
  onCloseDigest,
  onSelectSource,
}: DigestListScreenProps) {
  const { t } = useTranslation();
  const [knownDigest, setKnownDigest] = useState<KnownId | null>(null);
  const [knownSource, setKnownSource] = useState<KnownId | null>(null);

  function handleCloseSource() {
    onSelectSource(null);
  }

  function handleOpenSource(source: SourceWithDigests) {
    setKnownSource({ publicId: source.publicId, id: source.sourceId });
    onSelectSource(source.publicId);
  }

  function handleOpenDigest(digest: DigestListItem) {
    setKnownDigest({ publicId: digest.publicId, id: digest.id });
  }

  const knownDigestId =
    knownDigest?.publicId === selectedDigestPublicId
      ? knownDigest.id
      : undefined;
  const knownSourceId =
    knownSource?.publicId === selectedSourcePublicId
      ? knownSource.id
      : undefined;

  return (
    <main className="flex min-w-0 flex-1 bg-surface-card">
      <div className="flex min-w-0 flex-1 flex-col">
        <NavigationBar items={[{ label: t("digest.nav_label") }]} />
        <DigestListBody
          selectedDigestPublicId={selectedDigestPublicId}
          onOpenSource={handleOpenSource}
          onOpenDigest={handleOpenDigest}
        />
      </div>

      {/* 다이제스트와 원문이 사이드뷰 한 자리를 나눠 쓴다 — URL이 둘 중 하나만
          담으므로 여기서도 다이제스트를 먼저 보고 없으면 원문을 본다. */}
      {selectedDigestPublicId !== null && (
        <SidePanel boundaryName="digest-detail" onClose={onCloseDigest}>
          <DigestDetailPanel
            digestPublicId={selectedDigestPublicId}
            knownDigestId={knownDigestId}
            onClose={onCloseDigest}
          />
        </SidePanel>
      )}
      {selectedDigestPublicId === null && selectedSourcePublicId !== null && (
        <SidePanel boundaryName="source-detail" onClose={handleCloseSource}>
          <SourceDetailPanel
            sourcePublicId={selectedSourcePublicId}
            knownSourceId={knownSourceId}
            onClose={handleCloseSource}
          />
        </SidePanel>
      )}
    </main>
  );
}
