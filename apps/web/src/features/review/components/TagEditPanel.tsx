import { useState } from "react";

import {
  DIGEST_TAGS_MAX,
  type ReviewTagDraft,
  TAG_TITLE_MAX_LENGTH,
  type TagColor,
} from "@nema-io/shared";
import { Chip, getRandomTagColor, Separator } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { isDuplicateLabelName } from "@web/utils/labelSearch";

import { LabelChipRow } from "./LabelChipRow";
import { LabelLimitNotice } from "./LabelLimitNotice";
import { TagCreateForm } from "./TagCreateForm";
import { TagSearchList } from "./TagSearchList";

interface TagEditPanelProps {
  tags: ReviewTagDraft[];
  disabled: boolean;
  onChange: (tags: ReviewTagDraft[]) => void;
}

// TopicEditPanel과 같은 구조(칩 목록 → 구분선 → 검색)를 따르되, 차이는 하나 —
// Tag는 이름만으로 생성이 안 끝난다(07-modeling.md Tag: description이 재사용
// 판단 기준이라 필수). "새로 만들기"를 누르면 검색 화면 대신 생성 폼으로 통째로
// 갈아끼운다 — 위에 가릴 게 없는 채로 칩 목록·구분선만 남으면 그 자체가 목적 없는
// 테두리로 보인다.
export function TagEditPanel({ tags, disabled, onChange }: TagEditPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);
  // 검색 목록의 "만들기" 미리보기 Badge와 생성 폼의 이름 Badge가 같은 색을
  // 보여줘야 해서, 랜덤 배정을 TagCreateForm 안이 아니라 여기서 한다(그 폼이
  // 실제로 마운트되기 전인 미리보기 단계에도 색이 필요하기 때문). 생성 폼을
  // 나갈 때(제출·뒤로 둘 다) 다시 뽑아, 같은 팝오버 세션에서 연달아 만들어도
  // 매번 새로 랜덤 배정한다(같은 색이 다시 뽑힐 수도 있다 — 이전 값 제외 없음).
  const [previewColor, setPreviewColor] = useState<TagColor>(() =>
    getRandomTagColor(),
  );
  const atMax = tags.length >= DIGEST_TAGS_MAX;

  // 항목 id 생성 시점은 TopicEditPanel과 같은 이유로 여기다(그 주석 참고).
  // 색도 id와 같은 자리에서 함께 배정한다(#515와 같은 원칙 — 20260728110000).
  function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
    color: TagColor;
  }) {
    onChange([
      ...tags,
      {
        id: crypto.randomUUID(),
        registryId: tag.id,
        title: tag.title,
        description: tag.description,
        color: tag.color,
      },
    ]);
    setQuery("");
  }

  // 생성 폼을 나가는 두 경로(제출·뒤로) 공통 — 다음 미리보기가 이번과 다른
  // 색을 보여주도록 여기서 같이 재배정한다.
  function closeCreateForm() {
    setCreatingTitle(null);
    setPreviewColor(getRandomTagColor());
  }

  function handleSubmitNew(
    title: string,
    description: string,
    color: TagColor,
  ) {
    onChange([
      ...tags,
      { id: crypto.randomUUID(), registryId: null, title, description, color },
    ]);
    setQuery("");
    closeCreateForm();
  }

  function handleRenameDraft(
    id: string,
    title: string,
    description: string,
    color: TagColor,
  ) {
    onChange(
      tags.map((tag) =>
        tag.id === id ? { ...tag, title, description, color } : tag,
      ),
    );
  }

  // DigestTopicPicker와 같은 이유 — 신규 먼저, 그룹 내부는 원래 순서 유지.
  const sortedTags = [...tags].sort(
    (a, b) => (a.registryId === null ? 0 : 1) - (b.registryId === null ? 0 : 1),
  );

  if (creatingTitle !== null) {
    return (
      <TagCreateForm
        title={creatingTitle}
        initialColor={previewColor}
        duplicateTitle={isDuplicateLabelName(
          creatingTitle,
          tags.map((tag) => tag.title),
        )}
        onBack={closeCreateForm}
        onSubmit={(description, color) =>
          handleSubmitNew(creatingTitle.trim(), description, color)
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <LabelChipRow
        query={query}
        disabled={disabled}
        searchable={!atMax}
        maxLength={TAG_TITLE_MAX_LENGTH}
        ariaLabel={t("review.label_search_placeholder")}
        onQueryChange={setQuery}
      >
        {sortedTags.map((tag) => (
          <Chip
            key={tag.id}
            color={tag.color}
            shape="rounded"
            truncated
            disabled={disabled}
            onRemove={() => onChange(tags.filter((t) => t.id !== tag.id))}
            removeAriaLabel={t("review.tag_remove_action")}
          >
            {tag.title}
          </Chip>
        ))}
      </LabelChipRow>
      <Separator />
      {atMax ? (
        <LabelLimitNotice
          message={t("review.tag_max_reached", { max: DIGEST_TAGS_MAX })}
        />
      ) : (
        <TagSearchList
          query={query}
          tags={tags}
          createPreviewColor={previewColor}
          onSelectExisting={handleSelectExisting}
          onStartCreate={setCreatingTitle}
          onRenameDraft={handleRenameDraft}
        />
      )}
    </div>
  );
}
