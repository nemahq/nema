import { useState } from "react";

import {
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import { Button, Input, Textarea } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface TagDraftRenameFormProps {
  title: string;
  description: string;
  // TopicDraftRenameForm과 같은 이유로 배열 대신 콜백 — 입력값이 바뀔 때마다
  // 이 폼 안에서 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수 없다.
  isDuplicateTitle: (title: string) => boolean;
  onSubmit: (title: string, description: string) => void;
}

// TopicDraftRenameForm과 같은 스코프(신규 Tag 자신만) — Tag는 description도
// 재사용 판단 기준(07-modeling.md)이라 이름과 같이 고칠 수 있어야 한다.
export function TagDraftRenameForm({
  title,
  description,
  isDuplicateTitle,
  onSubmit,
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

  function submit() {
    if (submittable) {
      onSubmit(trimmedTitle, trimmedDescription);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={titleValue}
        maxLength={TAG_TITLE_MAX_LENGTH}
        aria-label={t("review.tag_create_title_label")}
        aria-invalid={titleInvalid}
        onChange={(e) => setTitleValue(e.target.value)}
      />
      <Textarea
        value={descriptionValue}
        maxLength={TAG_DESCRIPTION_MAX_LENGTH}
        aria-label={t("review.tag_create_description_label")}
        aria-invalid={descriptionInvalid}
        onChange={(e) => setDescriptionValue(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="xs"
          disabled={!submittable}
          onClick={submit}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
