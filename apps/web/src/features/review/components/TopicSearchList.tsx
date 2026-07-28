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
  // 이미 붙은 것 판별과 중복 이름 검사에 둘 다 쓰인다 — Set·배열을 각각 만들어
  // 넘기면 매 렌더 새 identity라, 스토어에서 그대로 온 이 배열 하나만 받는다.
  topics: ReviewTopicDraft[];
  onSelectExisting: (topic: ReviewTopic) => void;
  onCreateNew: (name: string) => void;
  onRenameDraft: (id: string, title: string) => void;
}

const getTopicLabel = (topic: { title: string }) => topic.title;

function TopicSearchListContent({
  spaceId,
  query,
  topics,
  onSelectExisting,
  onCreateNew,
  onRenameDraft,
}: TopicSearchListProps) {
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  // 한 번에 하나만 편집 — 이미 열린 걸 그대로 두면 두 편집이 같은 topics 배열을
  // 동시에 patch하려다 서로의 변경을 덮어쓸 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: topicList.topics,
      getLabel: getTopicLabel,
      query,
      existingLabels: topics.map((topic) => topic.title),
    });
  const attachedIds = new Set(topics.map((topic) => topic.registryId));
  const draftMatches = filterDraftLabelCandidates(topics, query);
  const activeRegistryTitles = getActiveLabelTitles(
    topicList.topics,
    getTopicLabel,
  );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftMatches.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onCreateNew}
    >
      {draftMatches.map((draft) => (
        <LabelSearchRow
          key={draft.id}
          label={draft.title}
          attached
          isNew
          actions={
            <LabelDraftEditPopover
              open={editingId === draft.id}
              onOpenChange={(open) => setEditingId(open ? draft.id : null)}
            >
              <TopicDraftRenameForm
                title={draft.title}
                isDuplicateTitle={buildDraftRenameDuplicateCheck({
                  registryLabels: activeRegistryTitles,
                  digestLabels: topics,
                  excludeId: draft.id,
                })}
                onSubmit={(title) => {
                  onRenameDraft(draft.id, title);
                  setEditingId(null);
                }}
              />
            </LabelDraftEditPopover>
          }
        />
      ))}
      {candidates.map((topic) => (
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
