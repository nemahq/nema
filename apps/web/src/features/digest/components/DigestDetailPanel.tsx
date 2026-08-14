import { Suspense, useEffect } from "react";

import {
  Button,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  useDigestQuery,
  useDigestSuspenseQuery,
} from "@web/features/digest/hooks/useDigestQuery";
import { useTranslation } from "@web/lib/tolgee";
import { isNotFoundError } from "@web/lib/trpc";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestDeleteAction } from "./DigestDeleteAction";
import { DigestDetailPanelSkeleton } from "./DigestDetailPanelSkeleton";
import { DigestReadonlyBodyFields } from "./DigestReadonlyBodyFields";
import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestDetailPanelProps {
  digestPublicId: string;
  // 목록 클릭으로 열었다면 호출자가 이미 내부 id를 들고 있다(SourceDetailPanel의
  // knownSourceId와 같은 이유) — 없으면(새로고침·딥링크) 아래 useDigestQuery
  // (non-suspense)가 응답을 받아오는 대로 채운다.
  knownDigestId?: string;
  onClose: () => void;
}

interface DigestDetailCloseButtonProps {
  onClose: () => void;
}

function DigestDetailCloseButton({ onClose }: DigestDetailCloseButtonProps) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("common.close")}
          onClick={onClose}
          className="size-7 text-fg-tertiary"
        >
          <X className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("common.close")}</TooltipContent>
    </Tooltip>
  );
}

interface DigestDetailPanelContentProps {
  digestPublicId: string;
}

function DigestDetailPanelContent({
  digestPublicId,
}: DigestDetailPanelContentProps) {
  const [digest] = useDigestSuspenseQuery(digestPublicId);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pt-3 pb-8">
      <CandidateCardFrame
        wash={
          <div className="flex min-w-0 items-center gap-2">
            <DigestTypeBadge type={digest.type} />
            {/* 목록에서는 한 줄로 잘리는 제목을 여기서는 통째로 보여준다 —
                상세까지 잘리면 이 패널을 열 이유가 없다. truncate 대신
                min-w-0만 둬서 넘치면 줄바꿈되게 한다. */}
            <Text as="span" size="xl" weight="semibold" className="min-w-0">
              {digest.title}
            </Text>
          </div>
        }
      >
        <DigestReadonlyBodyFields digest={digest} />
      </CandidateCardFrame>
    </div>
  );
}

interface DigestDetailTimestampProps {
  digestId: string;
}

// 헤더 자리로 옮긴 시각 — 워시 구역과 별개로 여기서 다시 구독한다(같은 쿼리라
// 캐시를 나눠 쓸 뿐 추가 요청은 안 나간다). 헤더는 페칭과 무관하게 즉시
// 눌러져야 해서, 이 조각만 따로 Suspense/ErrorBoundary로 감싸 실패해도
// 조용히 안 보여줄 뿐 닫기·삭제는 막지 않는다 — 실제 에러 안내는 본문 쪽
// 경계가 이미 하고 있어 여기서 또 보고하지 않는다(shouldReport false).
function DigestDetailTimestamp({ digestId }: DigestDetailTimestampProps) {
  const [digest] = useDigestSuspenseQuery(digestId);
  return <RelativeTime dateTime={digest.createdAt} />;
}

interface DigestDetailPanelErrorProps extends ErrorFallbackProps {
  onClose: () => void;
}

function DigestDetailPanelError({
  onClose,
  ...fallbackProps
}: DigestDetailPanelErrorProps) {
  const missing = isNotFoundError(fallbackProps.error);

  useEffect(
    function closeOnMissingDigest() {
      // 걷어낸 다이제스트를 가리키는 죽은 ?digest=<id> 링크는 재시도해도 같은
      // NOT_FOUND를 반복할 뿐이다 — SourceDetailPanel과 같은 이유로 에러를
      // 보여주는 대신 패널을 스스로 닫는다.
      if (missing) {
        onClose();
      }
    },
    [missing, onClose],
  );

  if (missing) {
    return null;
  }

  return <SectionErrorFallback {...fallbackProps} />;
}

// 다이제스트 상세 — SidePanel 안에 얹는 읽기 전용 콘텐츠. 편집은 없고, 결과가
// 나쁘면 고치는 게 아니라 빼고 다시 돌린다. 사이드뷰 헤더는 액션 전용으로 비워
// 두고, 유형·제목은 CandidateCardFrame의 워시 구역으로 내린다(원문 상세
// SourceDetailPanel과 같은 이유로 헤더는 페칭과 별개로 즉시 눌러진다). 시각은
// 원문 상세와 자리를 맞추려고 휴지통 버튼 왼쪽에 둔다.
export function DigestDetailPanel({
  digestPublicId,
  knownDigestId,
  onClose,
}: DigestDetailPanelProps) {
  // 클릭 진입이면 knownDigestId가 이미 있다 — 그대로 쓴다. 새로고침·딥링크로
  // 들어와 없으면 digest.get 응답(캐시 공유, 아래 DigestDetailPanelContent의
  // useDigestSuspenseQuery와 같은 키)이 올 때까지 undefined다.
  const { data: fetchedDigest } = useDigestQuery(digestPublicId);
  const digestId = knownDigestId ?? fetchedDigest?.id;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-end gap-3 px-6">
        <ErrorBoundary
          boundaryName="digest-detail-timestamp"
          fallback={null}
          shouldReport={() => false}
        >
          <Suspense fallback={null}>
            <DigestDetailTimestamp digestId={digestId} />
          </Suspense>
        </ErrorBoundary>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <DigestDeleteAction digestId={digestId} onDeleted={onClose} />
          <DigestDetailCloseButton onClose={onClose} />
        </div>
      </div>

      <ErrorBoundary
        boundaryName="digest-detail"
        // NOT_FOUND는 걷어낸 다이제스트를 가리키는 죽은 링크에서 자연히 발생하는
        // 예상된 에러라 노이즈로 보고하지 않는다.
        shouldReport={(error) => !isNotFoundError(error)}
        fallbackRender={(fallbackProps) => (
          <DigestDetailPanelError {...fallbackProps} onClose={onClose} />
        )}
      >
        <Suspense fallback={<DigestDetailPanelSkeleton />}>
          <DigestDetailPanelContent digestPublicId={digestPublicId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
