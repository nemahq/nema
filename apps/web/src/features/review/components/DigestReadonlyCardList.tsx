import type { DigestDetailSnapshot } from "@web/features/review/types";

import { DigestReadonlyCardWithSource } from "./DigestReadonlyCardWithSource";

interface DigestReadonlyCardListProps {
  digests: DigestDetailSnapshot[];
}

export function DigestReadonlyCardList({
  digests,
}: DigestReadonlyCardListProps) {
  return (
    <div className="flex flex-col gap-4">
      {digests.map((digest) => (
        <DigestReadonlyCardWithSource
          key={digest.id}
          digest={digest}
          tabId={`tab-source-${digest.sourceId}`}
        />
      ))}
    </div>
  );
}
