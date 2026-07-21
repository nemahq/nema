import { Suspense } from "react";

import { Button, Separator, Skeleton } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useReferenceCitingDigestsSuspenseQuery } from "@web/features/reference/hooks/useReferenceCitingDigestsQuery";
import { useReferenceDetailSuspenseQuery } from "@web/features/reference/hooks/useReferenceQuery";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceArchivedBanner } from "./ReferenceArchivedBanner";
import { ReferenceCitingDigestsSection } from "./ReferenceCitingDigestsSection";
import { ReferenceDetailMoreMenu } from "./ReferenceDetailMoreMenu";
import { ReferenceEditor } from "./ReferenceEditor";
import { ReferenceTagRow } from "./ReferenceTagRow";

interface ReferenceDetailContentProps {
  referenceId: string;
  onClose: () => void;
}

function ReferenceDetailContent({
  referenceId,
  onClose,
}: ReferenceDetailContentProps) {
  const { t } = useTranslation();
  const [reference] = useReferenceDetailSuspenseQuery(referenceId);
  const [{ digests: citingDigests }] =
    useReferenceCitingDigestsSuspenseQuery(referenceId);
  const isArchived = reference.status === "archived";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          {!isArchived && (
            <ReferenceDetailMoreMenu referenceId={reference.id} />
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <Separator />

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

function ReferenceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function ReferenceDetailPanel(props: ReferenceDetailContentProps) {
  return (
    <ErrorBoundary
      boundaryName="reference-detail"
      fallbackRender={(fallbackProps) => (
        <SectionErrorFallback {...fallbackProps} />
      )}
    >
      <Suspense fallback={<ReferenceDetailSkeleton />}>
        <ReferenceDetailContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
