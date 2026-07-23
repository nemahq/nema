import { Suspense, useState } from "react";

import {
  type DigestTagDraft,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
} from "@nema-io/shared";

import { useEditing } from "@web/features/review/components/EditingProvider";
import { useUpdateTag } from "@web/features/review/hooks/useUpdateTag";
import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { useTranslation } from "@web/lib/tolgee";
import { buildLabelSearchState } from "@web/utils/labelSearch";

import { LabelInlineEditPopover } from "./LabelInlineEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { LabelTextInput } from "./LabelTextInput";

interface ReviewTag {
  id: string;
  title: string;
  description: string;
}

interface TagSearchListProps {
  query: string;
  // TopicSearchList와 같은 이유로 파생값(Set·이름 배열) 대신 원본 배열을 받는다.
  tags: DigestTagDraft[];
  onSelectExisting: (tag: ReviewTag) => void;
  onStartCreate: (title: string) => void;
}

const getTagLabel = (tag: { title: string }) => tag.title;

function TagSearchListContent({
  query,
  tags,
  onSelectExisting,
  onStartCreate,
}: TagSearchListProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const [tagList] = useTagListSuspenseQuery();
  const updateTag = useUpdateTag();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: tagList.tags,
      getLabel: getTagLabel,
      query,
      existingLabels: tags.map((tag) => tag.title),
    });
  const attachedIds = new Set(tags.map((tag) => tag.id));

  // 버튼(저장/취소) 없이 메뉴처럼 — 오버레이가 어떻게 닫히든(바깥 클릭·Escape·
  // Enter) 그 시점의 값을 그대로 적용한다. 두 필드를 독립적으로 다룬다 — 하나만
  // 비운 채 닫으면(예: 설명만 실수로 지움) 그 필드만 원래 값으로 되돌리고, 값이
  // 있는 다른 필드의 수정은 살린다(AND 조건으로 묶으면 description만 비어도
  // title 변경까지 조용히 버려진다).
  //
  // 스토어 반영(dispatch)을 mutate 성공 콜백이 아니라 여기서 동기로 먼저 한다 —
  // mutate(vars, {onSuccess})는 TanStack Query observer 구독에 걸려 있어서,
  // 이 컴포넌트가 언마운트(팝오버를 바로 닫는 등)되면 안 불릴 수 있다. 서버 응답을
  // 기다리지 않고 낙관적으로 반영하면 그 경합이 아예 없다.
  function applyAndClose(tag: ReviewTag) {
    const title = editingTitle.trim() || tag.title;
    const description = editingDescription.trim() || tag.description;
    if (title !== tag.title || description !== tag.description) {
      dispatch({ type: "tag/renamed", id: tag.id, title, description });
      updateTag.mutate({ id: tag.id, title, description });
    }
    setEditingId(null);
  }

  function handleEditOpenChange(tag: ReviewTag, open: boolean) {
    if (open) {
      setEditingId(tag.id);
      setEditingTitle(tag.title);
      setEditingDescription(tag.description);
      return;
    }
    applyAndClose(tag);
  }

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {candidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
          attached={attachedIds.has(tag.id)}
          editing={editingId === tag.id}
          onSelect={() => onSelectExisting(tag)}
        >
          <LabelInlineEditPopover
            open={editingId === tag.id}
            onOpenChange={(open) => handleEditOpenChange(tag, open)}
          >
            {/* Tag는 description이 필수(07-modeling.md)라 값이 이미 있는 게
                보장돼 있다 — Notion의 "값 없으면 접어두고 버튼으로 펼침"이
                여기선 안 맞아서 접이식을 버리고 이름·설명 둘 다 상시 노출한다.
                설명도 한 줄로 — 다른 필드들과 같은 "메뉴형" 밀도를 유지한다. */}
            <LabelTextInput
              autoFocus
              value={editingTitle}
              maxLength={TAG_TITLE_MAX_LENGTH}
              ariaLabel={t("review.tag_create_title_label")}
              onChange={setEditingTitle}
              onSubmit={() => applyAndClose(tag)}
            />
            <LabelTextInput
              value={editingDescription}
              maxLength={TAG_DESCRIPTION_MAX_LENGTH}
              ariaLabel={t("review.tag_create_description_label")}
              onChange={setEditingDescription}
              onSubmit={() => applyAndClose(tag)}
            />
          </LabelInlineEditPopover>
        </LabelSearchRow>
      ))}
    </LabelSearchList>
  );
}

// TopicSearchList와 같은 이유로 마운트 게이팅 — 팝오버가 열렸을 때만 그려진다.
export function TagSearchList(props: TagSearchListProps) {
  return (
    <LabelSearchSection boundaryName="tag-search">
      <Suspense fallback={<LabelSearchSkeleton />}>
        <TagSearchListContent {...props} />
      </Suspense>
    </LabelSearchSection>
  );
}
