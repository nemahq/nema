import { useEffect, useRef, useState } from "react";

import {
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
  type TagColor,
} from "@nema-io/shared";
import { Input, TagColorListPicker, Text } from "@nema-io/weave";

import { TAG_COLOR_LABEL_KEY } from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface TagDraftRenameFormProps {
  title: string;
  description: string;
  color: TagColor;
  // TopicDraftRenameForm과 같은 이유로 배열 대신 콜백 — 입력값이 바뀔 때마다
  // 이 폼 안에서 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수 없다.
  isDuplicateTitle: (title: string) => boolean;
  // 이름·설명은 저장 버튼이 없다 — 이 팝오버가 닫힐 때(바깥 클릭·Escape 등
  // LabelDraftEditPopover의 onOpenChange가 false를 받는 모든 경로) 유효한 값만
  // 커밋된다. 색은 별도로 onColorChange가 고른 즉시 반영한다.
  onCommitText: (title: string, description: string) => void;
  onColorChange: (color: TagColor) => void;
}

// TopicDraftRenameForm과 같은 스코프(신규 Tag 자신만) — Tag는 description도
// 재사용 판단 기준(07-modeling.md)이라 이름과 같이 고칠 수 있어야 한다.
export function TagDraftRenameForm({
  title,
  description,
  color,
  isDuplicateTitle,
  onCommitText,
  onColorChange,
}: TagDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const trimmedTitle = titleValue.trim();
  const trimmedDescription = descriptionValue.trim();
  const duplicateTitle = isDuplicateTitle(trimmedTitle);
  const titleInvalid = trimmedTitle === "" || duplicateTitle;
  const descriptionInvalid = trimmedDescription === "";
  const submittable = !titleInvalid && !descriptionInvalid;

  // 언마운트(=팝오버가 닫힘) 시점에 그때의 최신 입력값으로 커밋한다 —
  // useSourceComposerBody의 flushOnUnmount와 같은 패턴(ref로 최신값을 따라가다
  // cleanup에서 한 번만 읽는다). 의존성 배열을 비워 마운트~언마운트 사이 재렌더로는
  // 이 effect가 다시 돌지 않게 한다 — 그래야 cleanup이 "진짜 언마운트" 한 번에만
  // 실행된다. 유효하지 않은 값(빈 이름·중복 등)으로 닫히면 조용히 버려진다 —
  // 리뷰 화면의 다른 곳과 같이, 잘못된 값을 저장하느니 아무것도 안 하는 쪽을 택한다.
  const latestRef = useRef({
    trimmedTitle,
    trimmedDescription,
    submittable,
    onCommitText,
  });
  useEffect(function syncLatest() {
    latestRef.current = {
      trimmedTitle,
      trimmedDescription,
      submittable,
      onCommitText,
    };
  });
  useEffect(function commitOnClose() {
    return () => {
      const latest = latestRef.current;
      if (latest.submittable) {
        latest.onCommitText(latest.trimmedTitle, latest.trimmedDescription);
      }
    };
  }, []);

  function getTitleError() {
    if (trimmedTitle === "") {
      return t("common.name_required");
    }
    if (duplicateTitle) {
      return t("common.name_taken");
    }
    return null;
  }
  const titleError = getTitleError();
  const descriptionError = descriptionInvalid
    ? t("common.description_required")
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 이름·설명을 한 그룹(gap-2)으로 좁게 묶고, 색상 리스트는 별개
          관심사라 바깥 gap-3로 한 단 떼어 놓는다(TagCreateForm.tsx와 같은
          이유). */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 px-2">
          <Input
            autoFocus
            value={titleValue}
            maxLength={TAG_TITLE_MAX_LENGTH}
            placeholder={t("common.name_placeholder")}
            aria-label={t("common.name_label")}
            aria-invalid={titleInvalid}
            onChange={(e) => setTitleValue(e.target.value)}
          />
          <p
            role="alert"
            className={`text-xs ${titleError ? "text-status-error" : "text-transparent"}`}
          >
            {titleError ?? " "}
          </p>
        </div>
        <div className="flex flex-col gap-1 px-2">
          <Input
            value={descriptionValue}
            maxLength={TAG_DESCRIPTION_MAX_LENGTH}
            placeholder={t("common.description_placeholder")}
            aria-label={t("review.tag_create_description_label")}
            aria-invalid={descriptionInvalid}
            onChange={(e) => setDescriptionValue(e.target.value)}
          />
          <p
            role="alert"
            className={`text-xs ${descriptionError ? "text-status-error" : "text-transparent"}`}
          >
            {descriptionError ?? " "}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {/* px-2 — 위 이름·설명 Input과 좌측을 맞춘다(TagCreateForm.tsx의
            Colors 라벨과 같은 스타일도 통일). 색상 리스트 쪽은 ComboboxItem
            자신이 이미 px-2를 갖고 있어 래퍼까지 px-2를 또 두면 이중으로
            밀리므로 px-1만 준다 — 라벨과 리스트가 서로 다른 값을 쓰는 이유. */}
        <Text size="sm" color="tertiary" className="px-2">
          {t("review.tag_color_label")}
        </Text>
        <div
          role="group"
          aria-label={t("review.tag_color_label")}
          className="px-1"
        >
          <TagColorListPicker
            value={color}
            onChange={onColorChange}
            getColorLabel={(c) => t(TAG_COLOR_LABEL_KEY[c])}
          />
        </div>
      </div>
    </div>
  );
}
