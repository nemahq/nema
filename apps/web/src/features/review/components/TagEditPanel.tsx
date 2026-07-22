import { useState } from "react";

import { DIGEST_TAGS_MAX, type DigestTagDraft } from "@nema-io/shared";
import { Chip, Separator } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { isDuplicateLabelName } from "@web/utils/labelSearch";

import { LabelChipRow } from "./LabelChipRow";
import { LabelLimitNotice } from "./LabelLimitNotice";
import { TagCreateForm } from "./TagCreateForm";
import { TagSearchList } from "./TagSearchList";

interface TagEditPanelProps {
  tags: DigestTagDraft[];
  disabled: boolean;
  onChange: (tags: DigestTagDraft[]) => void;
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
  const atMax = tags.length >= DIGEST_TAGS_MAX;

  function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
  }) {
    onChange([...tags, tag]);
    setQuery("");
  }

  function handleSubmitNew(title: string, description: string) {
    onChange([...tags, { id: null, title, description }]);
    setQuery("");
    setCreatingTitle(null);
  }

  // 이름·설명 수정은 검색 리스트(다른 컴포넌트)에서 일어나지만, 그 결과를 이
  // Digest가 이미 붙여둔 tags 배열에도 바로 반영해야 위쪽 칩·바깥 트리거가
  // 새로고침 없이 새 값을 보여준다.
  function handleRenamed(renamed: {
    id: string;
    title: string;
    description: string;
  }) {
    onChange(
      tags.map((tag) =>
        tag.id === renamed.id
          ? { ...tag, title: renamed.title, description: renamed.description }
          : tag,
      ),
    );
  }

  if (creatingTitle !== null) {
    return (
      <TagCreateForm
        title={creatingTitle}
        duplicateTitle={isDuplicateLabelName(
          creatingTitle,
          tags.map((tag) => tag.title),
        )}
        onBack={() => setCreatingTitle(null)}
        onSubmit={(description) =>
          handleSubmitNew(creatingTitle.trim(), description)
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
        onQueryChange={setQuery}
      >
        {tags.map((tag, index) => (
          <Chip
            key={tag.id ?? `draft-${index}`}
            variant="outline"
            shape="rounded"
            disabled={disabled}
            onRemove={() => onChange(tags.filter((_, i) => i !== index))}
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
          onSelectExisting={handleSelectExisting}
          onStartCreate={setCreatingTitle}
          onRenamed={handleRenamed}
        />
      )}
    </div>
  );
}
