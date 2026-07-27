import { Suspense, useState } from "react";

import { type DigestTopicDraft, TOPIC_TITLE_MAX_LENGTH } from "@nema-io/shared";

import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import { useTranslation } from "@web/lib/tolgee";
import {
  buildLabelSearchState,
  isDuplicateLabelName,
} from "@web/utils/labelSearch";

import { LabelInlineEditPopover } from "./LabelInlineEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { LabelTextInput } from "./LabelTextInput";

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
  // 신규(id===null) 후보의 이름 수정 — 인덱스로 가리킨다(신규는 서버 id가 없어
  // 다른 방법으로 특정할 수 없다).
  onRenameDraft: (index: number, title: string) => void;
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
  const { t } = useTranslation();
  const [topicList] = useTopicListSuspenseQuery(spaceId);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: topicList.topics,
      getLabel: getTopicLabel,
      query,
      existingLabels: topics.map((topic) => topic.title),
    });
  const attachedIds = new Set(topics.map((topic) => topic.id));

  // 생성 시(canCreate)와 같은 두 기준으로 막는다 — 레지스트리 활성 항목과
  // 정확히 겹치거나, 이 Digest에 이미 붙은 다른 라벨(자기 자신 제외)과 겹치면
  // 안 된다.
  function isRenameDuplicate(nextTitle: string, index: number) {
    const trimmed = nextTitle.trim();
    const original = topics[index]?.title;
    if (trimmed === "" || trimmed === original) {
      return false;
    }
    const activeRegistryTitles = topicList.topics
      .filter((topic) => topic.status === "active")
      .map(getTopicLabel);
    const otherTitles = topics
      .filter((_, i) => i !== index)
      .map((topic) => topic.title);
    return isDuplicateLabelName(trimmed, [
      ...activeRegistryTitles,
      ...otherTitles,
    ]);
  }

  function applyAndClose(index: number) {
    const name = editingTitle.trim();
    if (name !== "" && !isRenameDuplicate(name, index)) {
      onRenameDraft(index, name);
    }
    setEditingIndex(null);
  }

  function handleEditOpenChange(index: number, open: boolean) {
    if (open) {
      setEditingIndex(index);
      setEditingTitle(topics[index].title);
      return;
    }
    applyAndClose(index);
  }

  const draftEntries = topics
    .map((topic, index) => ({ topic, index }))
    .filter(
      ({ topic }) =>
        topic.id === null &&
        topic.title.toLowerCase().includes(trimmedQuery.toLowerCase()),
    );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftEntries.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onCreateNew}
    >
      {draftEntries.map(({ topic, index }) => (
        <LabelSearchRow
          key={`draft-${index}`}
          label={topic.title}
          attached
          isNew
          editing={editingIndex === index}
          onSelect={() => {
            // 신규 라벨은 이미 첨부돼 있어 다시 고를 필요가 없다 — alreadySelected가
            // 클릭을 막아 이 콜백은 실제로 호출되지 않는다.
          }}
        >
          <LabelInlineEditPopover
            open={editingIndex === index}
            onOpenChange={(open) => handleEditOpenChange(index, open)}
          >
            <LabelTextInput
              autoFocus
              value={editingTitle}
              maxLength={TOPIC_TITLE_MAX_LENGTH}
              ariaLabel={t("review.topic_name_label")}
              invalid={
                editingIndex === index && isRenameDuplicate(editingTitle, index)
              }
              onChange={setEditingTitle}
              onSubmit={() => applyAndClose(index)}
            />
          </LabelInlineEditPopover>
        </LabelSearchRow>
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
