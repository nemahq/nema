import { Suspense, useMemo, useState } from "react";

import { Alert, Text } from "@nema-io/weave";

import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import {
  useDigestReviewSuspenseQuery,
  useReviewDraftReader,
} from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useRefetchReviewOnFocus } from "@web/features/review/hooks/useRefetchReviewOnFocus";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import { changesetRowAuthorLabel } from "@web/features/review/utils";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useNotificationSoftAsk } from "@web/hooks/useNotificationSoftAsk";
import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetConfirmDiscardActions } from "./ChangesetConfirmDiscardActions";
import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { DigestCandidateList } from "./DigestCandidateList";
import { ReferenceSection } from "./ReferenceSection";
import {
  clearAutosaveEntry,
  ReviewDraftProvider,
  useReviewDraftContext,
  useReviewSaveStatusContext,
} from "./ReviewDraftProvider";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { UnattachedLabelSection } from "./UnattachedLabelSection";
import { UndoRedoShortcuts } from "./UndoRedoShortcuts";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  missing_description: "review.confirm_disabled_missing_description",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// open 상태인 ingestion changeset의 편집 화면 — 모든 상태가 URL을 공유하므로
// (changesetDetailRegistry), 확정·버리기 성공 시 별도 이동 없이 getByNumber를
// 무효화하기만 하면 같은 URL이 자연히 ChangesetRecordScreen으로 넘어간다.
//
// 편집 중인 초안 전체를 여기서 구독한다 — 확정 페이로드도 차단 조건도 후보 전체를
// 봐야 나오는 값이라 어차피 화면 하나가 통째로 들고 있어야 한다. 대신 각 카드가 자기
// 항목만 prop으로 받아, 손대지 않은 항목은 초안이 갱신돼도 같은 객체를 그대로 받는다.
function IngestionContent() {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [draft, digestReviewQuery] = useDigestReviewSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  // digestReview.get엔 type/authorName이 없다 — changeset.getByNumber는
  // ChangesetDetailRouter가 같은 키로 이미 채워둔 캐시라 여기서 다시 불러도
  // 네트워크가 안 나간다(RevertReopenContent와 같은 캐시 히트 패턴).
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  const { flushPendingCommits, flushPendingSave, hasPendingEdits } =
    useReviewDraftContext();
  const readReviewDraft = useReviewDraftReader(spaceId, changesetNumber);
  const { saveStatus } = useReviewSaveStatusContext();
  useRefetchReviewOnFocus(digestReviewQuery.refetch, hasPendingEdits);
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();
  // 모든 다이제스트가 같은 Source 하나를 공유해 탭 id도 하나뿐이라, activeTabId만으론
  // 어느 카드에서 열었는지 구분되지 않는다 — 가장 최근에 누른 카드를 따로 들고 있어야
  // "이 카드의 트리거가 활성"을 정확히 판정할 수 있다.
  const [activeSourceDigestId, setActiveSourceDigestId] = useState<
    string | null
  >(null);
  // confirm의 전체 소요 시간(펜딩 저장 flush + confirm 자체)을 감싸는 자리 — flush
  // 구간은 개별 mutation의 isPending에 안 잡혀서, 이 로컬 상태가 그 구간까지 포함해
  // "확정 시도 중"을 표현한다.
  const [confirming, setConfirming] = useState(false);
  const reviewEditingState = useMemo(
    () => computeReviewEditingState(draft),
    [draft],
  );
  const reviewTitle = draft.sourceTitle ?? t("review.digest_review_title");

  const confirmReview = useConfirmReview(spaceId, changesetNumber);
  const discardReview = useDiscardReview(spaceId, changesetNumber);
  const showNotificationSoftAsk = useNotificationSoftAsk();

  // 지연 없는 raw isPending — discard/confirm 어느 쪽이 진행 중이든 즉시 나머지를
  // 잠가야 250ms 지연 구간 동안의 이중 클릭(레이스)을 막는다. Guard도 같은 locked를
  // 그대로 써서 개별 필드 disabled와 항상 같은 시점에 뜬다 — 로딩 텍스트에만 아래
  // usePendingAfterDelay를 따로 써서 빠르게 끝나는 액션에서 텍스트만 안 깜빡이게 한다.
  const locked =
    confirming || confirmReview.isPending || discardReview.isPending;
  const confirmPendingAfterDelay = usePendingAfterDelay(
    confirming || confirmReview.isPending,
  );
  const confirmDisabledReasonCode =
    computeConfirmDisabledReason(reviewEditingState);
  // 저장 실패(일반 실패·버전 충돌 모두)는 확정을 막는다 — 실패한 편집을 그대로
  // 확정해버리면 조용한 데이터 유실이 된다.
  const confirmDisabled =
    locked || saveStatus.kind !== "clean" || confirmDisabledReasonCode !== null;
  const confirmDisabledReasonText =
    confirmDisabledReasonCode &&
    t(CONFIRM_DISABLED_REASON_KEY[confirmDisabledReasonCode]);

  // 버튼 클릭이 현재 포커스 필드를 항상 blur시키는 건 아니다(예: 일부 브라우저는
  // 마우스 클릭으로 button에 포커스를 옮기지 않는다) — 그래서 열려있는 필드의 로컬
  // 버퍼가 아직 초안에 안 넘어갔을 수 있다. flush 후 캐시를 직접 다시 읽고, 그
  // 시점의 초안으로 차단 조건까지 다시 계산해야 방금 들어온 편집을 놓치지 않는다.
  async function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    flushPendingCommits();
    const latestDraft = readReviewDraft() ?? draft;
    if (
      computeConfirmDisabledReason(computeReviewEditingState(latestDraft)) !==
      null
    ) {
      return;
    }
    confirmReview.reset();
    setConfirming(true);
    try {
      await runConfirmReview({
        changesetId: latestDraft.changesetId,
        flushPendingSave,
        confirmReview: confirmReview.mutateAsync,
      });
    } catch {
      // 펜딩 저장 실패는 저장 상태 표시(navbar)가 이미 알린다. confirmReview 자체의
      // 실패는 전역 토스트(mutationCache.onError)가 띄운다. 어느 쪽이든 여기서
      // 추가로 할 일은 없다.
      return;
    } finally {
      setConfirming(false);
    }
    // 이 changeset은 이제 확정된 상태로 넘어가 이 key로 다시 편집이 들어올 일이
    // 없다 — 자동 저장 레지스트리 엔트리를 여기서 정리한다.
    clearAutosaveEntry(spaceId, changesetNumber);
    // try 밖에 둔다 — 여기서 던지면(예: localStorage 접근 실패) 위 catch가
    // "mutation 실패는 전역 토스트가 이미 처리한다"는 전제로 조용히 삼켜버린다.
    // 밖에 두면 앱 전역 unhandled rejection 리포트로 정상 노출된다.
    showNotificationSoftAsk();
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    discardReview.mutate(
      { changesetId: draft.changesetId },
      {
        onSuccess: () => {
          clearAutosaveEntry(spaceId, changesetNumber);
          showNotificationSoftAsk();
        },
      },
    );
  }

  // 다이제스트가 몇 개든 원문(Source)은 하나뿐이라 탭 id를 sourceId로 고정한다 —
  // 어느 카드에서 눌러도 같은 탭을 열거나 그 탭으로 포커스만 옮긴다. 이미 활성인
  // 카드에서 다시 누르면 닫는다(토글) — 여러 카드가 같은 탭을 가리켜서 "열기"만
  // 있으면 카드 쪽엔 탭을 닫을 방법이 없다.
  function handleViewSource(digestId: string) {
    if (activeTabId === draft.sourceId && activeSourceDigestId === digestId) {
      closeTab(draft.sourceId);
      return;
    }
    setActiveSourceDigestId(digestId);
    openTab({
      id: draft.sourceId,
      label: reviewTitle,
      content: (
        <div className="flex flex-col gap-3 p-4">
          <Text as="h2" size="lg" weight="semibold">
            {reviewTitle}
          </Text>
          <Text
            as="p"
            size="sm"
            color="secondary"
            className="whitespace-pre-wrap"
          >
            {draft.sourceBody}
          </Text>
        </div>
      ),
    });
  }

  const sourceTabOpen = activeTabId === draft.sourceId;
  const authorLabel = changesetRowAuthorLabel({
    type: changesetDetail.type,
    state: "open",
    authorName: changesetDetail.authorName,
    closedByName: changesetDetail.closedByName,
    t,
  });

  return (
    <ChangesetDetailLayout
      title={reviewTitle}
      navBarRightContent={<SaveStatusIndicator />}
    >
      <UndoRedoShortcuts />
      <ChangesetDetailHeader
        title={reviewTitle}
        changesetNumber={draft.changesetNumber}
        state="open"
        authorLabel={authorLabel}
        time={changesetDetail.createdAt}
        actions={
          <ChangesetConfirmDiscardActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={discardReview.isPendingAfterDelay}
            confirmPending={confirmPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={confirmDisabled}
          />
        }
      />
      <div className="flex flex-col gap-4">
        {/* 조용한 텍스트 한 줄로는 확정이 막혀 있다는 게 눈에 안 들어와서 Alert로
            올렸다. */}
        {confirmDisabledReasonText && (
          <Alert variant="warning">{confirmDisabledReasonText}</Alert>
        )}

        <DigestCandidateList
          digests={draft.digests}
          labelDraft={draft.labelDraft}
          disabled={locked}
          activeSourceDigestId={sourceTabOpen ? activeSourceDigestId : null}
          onViewSource={handleViewSource}
        />

        <UnattachedLabelSection
          digests={draft.digests}
          labelDraft={draft.labelDraft}
          disabled={locked}
        />

        <ReferenceSection
          digests={draft.digests}
          newReferences={draft.newReferences}
          citedReferences={draft.citedReferences}
          disabled={locked}
        />
      </div>
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 리뷰 콘텐츠 쿼리(digestReview.get)에 대한 Suspense만
// 책임진다.
export function IngestionScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <ReviewDraftProvider>
        <IngestionContent />
      </ReviewDraftProvider>
    </Suspense>
  );
}
