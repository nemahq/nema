import { useState } from "react";

import { DIGEST_TOPICS_MAX, type DigestTopicDraft } from "@nema-io/shared";
import { Chip, Separator } from "@nema-io/weave";

import { useCurrentSpaceId } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

import { LabelChipRow } from "./LabelChipRow";
import { LabelLimitNotice } from "./LabelLimitNotice";
import { TopicSearchList } from "./TopicSearchList";

interface TopicEditPanelProps {
  topics: DigestTopicDraft[];
  disabled: boolean;
  onChange: (topics: DigestTopicDraft[]) => void;
}

// 색은 안 쓴다 — Topic은 조용하게 두고 테두리로만 구분한다(이번 라운드 원칙).
// shape="rounded"를 명시하는 이유 — Chip 기본값은 pill인데, 여러 개를 나란히
// 늘어놓는 이 자리엔 pill이 아니라 각진 모양이 맞다.
export function TopicEditPanel({
  topics,
  disabled,
  onChange,
}: TopicEditPanelProps) {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const [query, setQuery] = useState("");
  const atMax = topics.length >= DIGEST_TOPICS_MAX;

  function handleSelectExisting(topic: { id: string; name: string }) {
    onChange([...topics, topic]);
    setQuery("");
  }

  function handleCreateNew(name: string) {
    onChange([...topics, { id: null, name }]);
    setQuery("");
  }

  // 이름 수정은 검색 리스트(다른 컴포넌트)에서 일어나지만, 그 결과를 이 Digest가
  // 이미 붙여둔 topics 배열에도 바로 반영해야 위쪽 칩·바깥 트리거가 새로고침 없이
  // 새 이름을 보여준다.
  function handleRenamed(renamed: { id: string; name: string }) {
    onChange(
      topics.map((topic) =>
        topic.id === renamed.id ? { ...topic, name: renamed.name } : topic,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <LabelChipRow
        query={query}
        disabled={disabled}
        searchable={!atMax}
        onQueryChange={setQuery}
      >
        {topics.map((topic, index) => (
          <Chip
            key={topic.id ?? `draft-${index}`}
            variant="outline"
            shape="rounded"
            disabled={disabled}
            onRemove={() => onChange(topics.filter((_, i) => i !== index))}
            removeAriaLabel={t("review.topic_remove_action", {
              label: topic.name,
            })}
          >
            {topic.name}
          </Chip>
        ))}
      </LabelChipRow>
      <Separator />
      {atMax ? (
        <LabelLimitNotice
          message={t("review.topic_max_reached", { max: DIGEST_TOPICS_MAX })}
        />
      ) : (
        <TopicSearchList
          spaceId={spaceId}
          query={query}
          topics={topics}
          onSelectExisting={handleSelectExisting}
          onCreateNew={handleCreateNew}
          onRenamed={handleRenamed}
        />
      )}
    </div>
  );
}
