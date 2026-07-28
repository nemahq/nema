import { useState } from "react";

import {
  DIGEST_TOPICS_MAX,
  type ReviewTopicDraft,
  TOPIC_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import { Chip, Separator } from "@nema-io/weave";

import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useTranslation } from "@web/lib/tolgee";

import { LabelChipRow } from "./LabelChipRow";
import { LabelLimitNotice } from "./LabelLimitNotice";
import { TopicSearchList } from "./TopicSearchList";

interface TopicEditPanelProps {
  topics: ReviewTopicDraft[];
  disabled: boolean;
  onChange: (topics: ReviewTopicDraft[]) => void;
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

  // 항목 id는 여기서 만든다 — 저장 응답을 기다렸다 붙이면 그사이 편집(삭제·정렬)이
  // 가리킬 값이 없어, 이 id가 없애려는 인덱스 기반 식별로 되돌아간다.
  function handleSelectExisting(topic: { id: string; title: string }) {
    onChange([
      ...topics,
      { id: crypto.randomUUID(), registryId: topic.id, title: topic.title },
    ]);
    setQuery("");
  }

  function handleCreateNew(name: string) {
    onChange([
      ...topics,
      { id: crypto.randomUUID(), registryId: null, title: name },
    ]);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
      <LabelChipRow
        query={query}
        disabled={disabled}
        searchable={!atMax}
        maxLength={TOPIC_TITLE_MAX_LENGTH}
        ariaLabel={t("review.label_search_placeholder")}
        onQueryChange={setQuery}
      >
        {topics.map((topic, index) => (
          <Chip
            key={topic.id}
            variant="outline"
            shape="rounded"
            disabled={disabled}
            onRemove={() => onChange(topics.filter((_, i) => i !== index))}
            removeAriaLabel={t("review.topic_remove_action", {
              label: topic.title,
            })}
          >
            {topic.title}
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
        />
      )}
    </div>
  );
}
