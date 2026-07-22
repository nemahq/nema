import { Suspense, useState } from "react";

import type { DigestTopicDraft } from "@nema-io/shared";

import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import { useUpdateTopic } from "@web/features/review/hooks/useUpdateTopic";
import { buildLabelSearchState } from "@web/utils/labelSearch";

import { LabelInlineEditPopover } from "./LabelInlineEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { LabelTextInput } from "./LabelTextInput";

interface ReviewTopic {
  id: string;
  name: string;
}

interface TopicSearchListProps {
  spaceId: string;
  query: string;
  // 이미 붙은 것 판별과 중복 이름 검사에 둘 다 쓰인다 — Set·배열을 각각 만들어
  // 넘기면 매 렌더 새 identity라, 스토어에서 그대로 온 이 배열 하나만 받는다.
  topics: DigestTopicDraft[];
  onSelectExisting: (topic: ReviewTopic) => void;
  onCreateNew: (name: string) => void;
  onRenamed: (topic: ReviewTopic) => void;
}

const getTopicLabel = (topic: { name: string }) => topic.name;

function TopicSearchListContent({
  spaceId,
  query,
  topics,
  onSelectExisting,
  onCreateNew,
  onRenamed,
}: TopicSearchListProps) {
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  const updateTopic = useUpdateTopic();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: topicList.topics,
      getLabel: getTopicLabel,
      query,
      existingLabels: topics.map((topic) => topic.name),
    });
  const attachedIds = new Set(topics.map((topic) => topic.id));

  // 버튼(저장/취소) 없이 메뉴처럼 — 오버레이가 어떻게 닫히든(바깥 클릭·Escape·
  // Enter) 그 시점의 값을 그대로 적용한다. 바뀐 게 없거나 빈 값이면 조용히
  // 원래 이름을 유지한다(빈 이름 저장은 애초에 막혀야 함).
  function applyAndClose(topic: ReviewTopic) {
    const name = editingName.trim();
    if (name !== "" && name !== topic.name) {
      updateTopic.mutate(
        { id: topic.id, name },
        { onSuccess: () => onRenamed({ id: topic.id, name }) },
      );
    }
    setEditingId(null);
  }

  function handleEditOpenChange(topic: ReviewTopic, open: boolean) {
    if (open) {
      setEditingId(topic.id);
      setEditingName(topic.name);
      return;
    }
    applyAndClose(topic);
  }

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0}
      hasAnyLabel={topicList.topics.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onCreateNew}
    >
      {candidates.map((topic) => (
        <LabelSearchRow
          key={topic.id}
          label={topic.name}
          attached={attachedIds.has(topic.id)}
          editing={editingId === topic.id}
          onSelect={() => onSelectExisting(topic)}
        >
          <LabelInlineEditPopover
            open={editingId === topic.id}
            onOpenChange={(open) => handleEditOpenChange(topic, open)}
          >
            <LabelTextInput
              autoFocus
              value={editingName}
              onChange={setEditingName}
              onSubmit={() => applyAndClose(topic)}
            />
          </LabelInlineEditPopover>
        </LabelSearchRow>
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
