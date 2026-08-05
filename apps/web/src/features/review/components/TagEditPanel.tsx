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
import { useReviewDraftContext } from "./ReviewDraftProvider";
import { TagCreateForm } from "./TagCreateForm";
import { TagSearchList } from "./TagSearchList";

interface TagEditPanelProps {
  digestId: string;
  // 지금 이 Digest에 붙은 Tag(이미 리뷰 팔레트에서 해석된 값) — DigestTagPicker가
  // tagPalette에서 id로 찾아 넘긴다.
  attachedTags: ReviewTagDraft[];
  tagPalette: ReviewTagDraft[];
  disabled: boolean;
}

// TopicEditPanel과 같은 구조(칩 목록 → 구분선 → 검색)를 따르되, 차이는 하나 —
// Tag는 이름만으로 생성이 안 끝난다(07-modeling.md Tag: description이 재사용
// 판단 기준이라 필수). "새로 만들기"를 누르면 검색 화면 대신 생성 폼으로 통째로
// 갈아끼운다 — 위에 가릴 게 없는 채로 칩 목록·구분선만 남으면 그 자체가 목적 없는
// 테두리로 보인다.
//
// Tag 자체는 이 Digest 소유가 아니라 리뷰 레벨 공유 팔레트(labelDraft.tags)
// 항목이다(#28) — 여기서 하는 일은 "팔레트에 새로 만들기/이름 고치기"(label/*
// 액션)와 "이 Digest에 붙이기/떼기"(digest/attachTag·detachTag)를 조합하는 것뿐,
// tags 배열을 직접 들고 다니지 않는다.
export function TagEditPanel({
  digestId,
  attachedTags,
  tagPalette,
  disabled,
}: TagEditPanelProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
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
  const atMax = attachedTags.length >= DIGEST_TAGS_MAX;
  // TopicEditPanel과 같은 이유(그쪽 주석 참고) — 상한이어도 붙은 신규 라벨이
  // 있을 때만 검색 리스트를 계속 마운트한다.
  const showSearchList =
    !atMax || attachedTags.some((tag) => tag.registryId === null);

  // 레지스트리 기존 태그를 고르든, 다른 Digest가 이미 이 리뷰에 만들어 둔 draft
  // 태그를 고르든 — 팔레트에 그 id가 이미 있으면 그 객체를 그대로 재사용해
  // 붙인다(같은 이름은 같은 라벨이라는 #28의 핵심 약속). 팔레트에 없는(순수
  // 레지스트리 검색 결과) 경우에만 새 팔레트 항목을 만든다 — 이때 항목의 id는
  // 레지스트리 행 id를 그대로 쓴다. 그래야 다른 Digest가 같은 레지스트리
  // 태그를 나중에 골라도 같은 id로 만나 팔레트에 중복이 안 생긴다.
  function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
    color: TagColor;
  }) {
    const existing = tagPalette.find((candidate) => candidate.id === tag.id);
    dispatch({
      type: "digest/attachTag",
      digestId,
      tag: existing ?? {
        id: tag.id,
        registryId: tag.id,
        title: tag.title,
        description: tag.description,
        color: tag.color,
      },
    });
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
    dispatch({
      type: "digest/attachTag",
      digestId,
      tag: {
        id: crypto.randomUUID(),
        registryId: null,
        title,
        description,
        color,
      },
    });
    setQuery("");
    closeCreateForm();
  }

  function handleRenameDraft(
    id: string,
    title: string,
    description: string,
    color: TagColor,
  ) {
    dispatch({ type: "label/renameTag", id, title, description, color });
  }

  function handleDeleteDraft(id: string) {
    dispatch({ type: "label/removeTag", id });
  }

  // DigestTopicPicker와 같은 이유 — 신규 먼저, 그룹 내부는 원래 순서 유지.
  const sortedTags = [...attachedTags].sort(
    (a, b) => (a.registryId === null ? 0 : 1) - (b.registryId === null ? 0 : 1),
  );

  if (creatingTitle !== null) {
    return (
      <TagCreateForm
        title={creatingTitle}
        initialColor={previewColor}
        duplicateTitle={isDuplicateLabelName(
          creatingTitle,
          tagPalette.map((tag) => tag.title),
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
            onRemove={() =>
              dispatch({ type: "digest/detachTag", digestId, tagId: tag.id })
            }
            removeAriaLabel={t("review.tag_remove_action")}
          >
            {tag.title}
          </Chip>
        ))}
      </LabelChipRow>
      <Separator />
      {atMax && (
        <LabelLimitNotice
          message={t("review.tag_max_reached", { max: DIGEST_TAGS_MAX })}
        />
      )}
      {showSearchList && (
        <TagSearchList
          query={query}
          attachedTags={attachedTags}
          paletteTags={tagPalette}
          createPreviewColor={previewColor}
          atMax={atMax}
          onSelectExisting={handleSelectExisting}
          onStartCreate={setCreatingTitle}
          onRenameDraft={handleRenameDraft}
          onDeleteDraft={handleDeleteDraft}
        />
      )}
    </div>
  );
}
