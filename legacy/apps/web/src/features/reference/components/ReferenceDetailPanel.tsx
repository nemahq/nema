import { Suspense } from "react";

import { Separator, Skeleton } from "@nema-io/weave";

import { useReferenceDetailSuspenseQuery } from "@web/features/reference/hooks/useReferenceQuery";
import { useReferenceCitingDigestsSuspenseQuery } from "@web/hooks/useReferenceCitingDigestsQuery";

import { ReferenceArchivedBanner } from "./ReferenceArchivedBanner";
import { ReferenceCitingDigestsSection } from "./ReferenceCitingDigestsSection";
import { ReferenceDetailMoreMenu } from "./ReferenceDetailMoreMenu";
import { ReferenceEditor } from "./ReferenceEditor";
import { ReferenceTagRow } from "./ReferenceTagRow";

interface ReferenceDetailPanelProps {
  referenceId: string;
}

// 닫기(X) 버튼은 여기 없다 — SidePanel이 이 컴포넌트를 감싸는 ErrorBoundary를
// 이미 갖고 있어서(reference.get이 실패하는 죽은 링크·권한 없는 워크스페이스
// 케이스), 이 안에 X를 두면 에러 상태에서 같이 사라져 탈출구가 없어진다.
// X는 SidePanel 바깥(ReferenceListScreen)에 둔다.
function ReferenceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function ReferenceDetailContent({ referenceId }: ReferenceDetailPanelProps) {
  const [reference] = useReferenceDetailSuspenseQuery(referenceId);
  const [{ digests: citingDigests }] =
    useReferenceCitingDigestsSuspenseQuery(referenceId);
  const isArchived = reference.status === "archived";

  return (
    <div className="flex h-full flex-col">
      {!isArchived && (
        <>
          <div className="flex items-center px-4 py-2">
            <ReferenceDetailMoreMenu referenceId={reference.id} />
          </div>
          <Separator />
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        {isArchived && <ReferenceArchivedBanner />}

        <ReferenceEditor reference={reference} readOnly={isArchived} />

        <ReferenceTagRow
          referenceId={reference.id}
          tags={reference.tags}
          disabled={isArchived}
        />

        <ReferenceCitingDigestsSection citingDigests={citingDigests} />
      </div>
    </div>
  );
}

export function ReferenceDetailPanel(props: ReferenceDetailPanelProps) {
  return (
    <Suspense fallback={<ReferenceDetailSkeleton />}>
      <ReferenceDetailContent {...props} />
    </Suspense>
  );
}
