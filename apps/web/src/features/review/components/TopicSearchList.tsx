import { Suspense } from "react";

import type { DigestTopicDraft } from "@nema-io/shared";

import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import { buildLabelSearchState } from "@web/utils/labelSearch";

import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";

interface ReviewTopic {
  id: string;
  title: string;
}

interface TopicSearchListProps {
  spaceId: string;
  query: string;
  // 이미 붙은 것 판별과 중복 이름 검사에 둘 다 쓰인다 — Set·배열을 각각 만들어
  // 넘기면 매 렌더 새 identity라, 스토어에서 그대로 온 이 배열 하나만 받는다.
  topics: DigestTopicDraft[];
  onSelectExisting: (topic: ReviewTopic) => void;
  onCreateNew: (name: string) => void;
}

const getTopicLabel = (topic: { title: string }) => topic.title;

function TopicSearchListContent({
  spaceId,
  query,
  topics,
  onSelectExisting,
  onCreateNew,
}: TopicSearchListProps) {
  const [topicList] = useTopicListSuspenseQuery(spaceId);

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: topicList.topics,
      getLabel: getTopicLabel,
      query,
      existingLabels: topics.map((topic) => topic.title),
    });
  const attachedIds = new Set(topics.map((topic) => topic.id));

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onCreateNew}
    >
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
