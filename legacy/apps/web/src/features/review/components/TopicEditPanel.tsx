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
import { useReviewDraftContext } from "./ReviewDraftProvider";
import { TopicSearchList } from "./TopicSearchList";

interface TopicEditPanelProps {
  digestId: string;
  // 지금 이 Digest에 붙은 Topic(이미 리뷰 팔레트에서 해석된 값).
  attachedTopics: ReviewTopicDraft[];
  topicPalette: ReviewTopicDraft[];
  disabled: boolean;
}

// 색은 안 쓴다 — Topic은 조용하게 두고 테두리로만 구분한다(이번 라운드 원칙).
// shape="rounded"를 명시하는 이유 — Chip 기본값은 pill인데, 여러 개를 나란히
// 늘어놓는 이 자리엔 pill이 아니라 각진 모양이 맞다.
//
// Topic 자체는 이 Digest 소유가 아니라 리뷰 레벨 공유 팔레트(labelDraft.topics)
// 항목이다(#28) — TagEditPanel과 같은 구조로 "팔레트에 새로 만들기/이름
// 고치기"(label/renameTopic)와 "이 Digest에 붙이기/떼기"(digest/attachTopic·
// detachTopic)를 조합한다.
export function TopicEditPanel({
  digestId,
  attachedTopics,
  topicPalette,
  disabled,
}: TopicEditPanelProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  const spaceId = useCurrentSpaceId();
  const [query, setQuery] = useState("");
  const atMax = attachedTopics.length >= DIGEST_TOPICS_MAX;
  // 상한 상태에서 검색 리스트를 계속 그리는 건 이미 붙은 신규 라벨의 미트볼
  // (삭제)에 계속 닿게 하려는 목적뿐이다 — 붙은 라벨이 전부 레지스트리
  // 기존이면 그 목적 자체가 없다. 이때도 계속 마운트하면 (a) 안 쓸 레지스트리
  // 목록을 또 fetch하고 (b) sortedRows가 빈 배열이 돼 "최대 5개까지..." 안내
  // 바로 아래 모순되는 "일치하는 항목이 없어요"가 뜬다.
  const showSearchList =
    !atMax || attachedTopics.some((topic) => topic.registryId === null);

  // TagEditPanel.handleSelectExisting과 같은 이유 — 팔레트에 이미 있는 항목(다른
  // Digest의 draft 포함)은 그대로 재사용하고, 순수 레지스트리 검색 결과만 그
  // 레지스트리 행 id를 팔레트 id로 삼아 새로 올린다.
  function handleSelectExisting(topic: { id: string; title: string }) {
    const existing = topicPalette.find(
      (candidate) => candidate.id === topic.id,
    );
    dispatch({
      type: "digest/attachTopic",
      digestId,
      topic: existing ?? {
        id: topic.id,
        registryId: topic.id,
        title: topic.title,
      },
    });
    setQuery("");
  }

  function handleCreateNew(name: string) {
    dispatch({
      type: "digest/attachTopic",
      digestId,
      topic: { id: crypto.randomUUID(), registryId: null, title: name },
    });
    setQuery("");
  }

  function handleRenameDraft(id: string, title: string) {
    dispatch({ type: "label/renameTopic", id, title });
  }

  function handleDeleteDraft(id: string) {
    dispatch({ type: "label/removeTopic", id });
  }

  // DigestTopicPicker와 같은 이유 — 신규 먼저, 그룹 내부는 원래 순서 유지.
  const sortedTopics = [...attachedTopics].sort(
    (a, b) => (a.registryId === null ? 0 : 1) - (b.registryId === null ? 0 : 1),
  );

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
        {sortedTopics.map((topic) => (
          <Chip
            key={topic.id}
            variant="outline"
            shape="rounded"
            truncated
            disabled={disabled}
            onRemove={() =>
              dispatch({
                type: "digest/detachTopic",
                digestId,
                topicId: topic.id,
              })
            }
            removeAriaLabel={t("review.topic_remove_action", {
              label: topic.title,
            })}
          >
            {topic.title}
          </Chip>
        ))}
      </LabelChipRow>
      <Separator />
      {atMax && (
        <LabelLimitNotice
          message={t("review.topic_max_reached", { max: DIGEST_TOPICS_MAX })}
        />
      )}
      {showSearchList && (
        <TopicSearchList
          spaceId={spaceId}
          query={query}
          attachedTopics={attachedTopics}
          paletteTopics={topicPalette}
          atMax={atMax}
          onSelectExisting={handleSelectExisting}
          onCreateNew={handleCreateNew}
          onRenameDraft={handleRenameDraft}
          onDeleteDraft={handleDeleteDraft}
        />
      )}
    </div>
  );
}
