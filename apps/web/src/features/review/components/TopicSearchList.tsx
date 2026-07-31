import { Suspense, useState } from "react";

import type { ReviewTopicDraft } from "@nema-io/shared";

import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import {
  buildDraftRenameDuplicateCheck,
  buildLabelSearchState,
  filterDraftLabelCandidates,
  getActiveLabelTitles,
} from "@web/utils/labelSearch";

import { LabelDraftEditPopover } from "./LabelDraftEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { TopicDraftRenameForm } from "./TopicDraftRenameForm";

interface ReviewTopic {
  id: string;
  title: string;
}

interface TopicSearchListProps {
  spaceId: string;
  query: string;
  // 지금 이 Digest에 붙은 Topic — "붙음" 표시 판정에만 쓴다.
  attachedTopics: ReviewTopicDraft[];
  // 리뷰 팔레트 전체(#28) — draft 후보와 중복 이름 판정 풀은 이제 이 Digest
  // 하나가 아니라 리뷰 전체를 본다.
  paletteTopics: ReviewTopicDraft[];
  onSelectExisting: (topic: ReviewTopic) => void;
  onCreateNew: (name: string) => void;
  onRenameDraft: (id: string, title: string) => void;
}

const getTopicLabel = (topic: { title: string }) => topic.title;

function TopicSearchListContent({
  spaceId,
  query,
  attachedTopics,
  paletteTopics,
  onSelectExisting,
  onCreateNew,
  onRenameDraft,
}: TopicSearchListProps) {
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  // 한 번에 하나만 편집 — 이미 열린 걸 그대로 두면 두 편집이 같은 팔레트를
  // 동시에 patch하려다 서로의 변경을 덮어쓸 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { candidates, trimmedQuery, canCreate } = buildLabelSearchState({
    items: topicList.topics,
    getLabel: getTopicLabel,
    query,
    existingLabels: paletteTopics.map((topic) => topic.title),
  });
  const attachedIds = new Set(attachedTopics.map((topic) => topic.id));
  const draftMatches = filterDraftLabelCandidates(paletteTopics, query);
  const activeRegistryTitles = getActiveLabelTitles(
    topicList.topics,
    getTopicLabel,
  );
  // TagSearchList와 같은 이유 — 이미 붙은 기존 Topic을 후보 목록 맨 앞으로.
  const sortedCandidates = [...candidates].sort(
    (a, b) => (attachedIds.has(a.id) ? 0 : 1) - (attachedIds.has(b.id) ? 0 : 1),
  );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftMatches.length > 0}
      canCreate={canCreate}
      onStartCreate={onCreateNew}
    >
      {draftMatches.map((draft) => (
        <LabelSearchRow
          key={draft.id}
          label={draft.title}
          attached={attachedIds.has(draft.id)}
          isNew
          onSelect={() => onSelectExisting(draft)}
          actions={
            <LabelDraftEditPopover
              open={editingId === draft.id}
              onOpenChange={(open) => setEditingId(open ? draft.id : null)}
            >
              <TopicDraftRenameForm
                title={draft.title}
                isDuplicateTitle={buildDraftRenameDuplicateCheck({
                  registryLabels: activeRegistryTitles,
                  digestLabels: paletteTopics,
                  excludeId: draft.id,
                })}
                onCommitText={(title) => onRenameDraft(draft.id, title)}
              />
            </LabelDraftEditPopover>
          }
        />
      ))}
      {sortedCandidates.map((topic) => (
        <LabelSearchRow
          key={topic.id}
          label={topic.title}
          attached={attachedIds.has(topic.id)}
          onSelect={() => onSelectExisting(topic)}
        />
      ))}
    </LabelSearchList>
  );
}

// enabled 대신 마운트로 게이팅한다 — 이 트리는 팝오버가 열렸을 때만 그려진다.
export function TopicSearchList(props: TopicSearchListProps) {
  return (
    <LabelSearchSection boundaryName="topic-search">
      <Suspense fallback={<LabelSearchSkeleton />}>
        <TopicSearchListContent {...props} />
      </Suspense>
    </LabelSearchSection>
  );
}
