import type { DigestDetailSnapshot } from "@web/features/review/types";

import { DigestReadonlyCard } from "./DigestReadonlyCard";

interface DigestReadonlyCardListProps {
  digests: DigestDetailSnapshot[];
}

export function DigestReadonlyCardList({
  digests,
}: DigestReadonlyCardListProps) {
  return (
    <div className="flex flex-col gap-4">
      {digests.map((digest) => (
        <DigestReadonlyCard key={digest.id} digest={digest} />
      ))}
    </div>
  );
}
