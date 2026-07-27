import { useState } from "react";

import { TOPIC_TITLE_MAX_LENGTH } from "@nema-io/shared";
import { Button, Input } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { isDuplicateLabelName } from "@web/utils/labelSearch";

interface TopicDraftRenameFormProps {
  title: string;
  existingLabels: string[];
  onSubmit: (title: string) => void;
}

// 신규(draft) Topic 자신의 이름만 고친다 — 기존 레지스트리 Topic 인라인 수정은
// 대상이 아니다(PR #506 컨센서스, review-flow.md). 취소 버튼이 없는 이유는
// 팝오버를 그냥 닫으면(바깥 클릭·Escape) 아무것도 안 바뀌기 때문 — 저장은
// 반드시 이 버튼을 눌러야 반영된다(TagCreateForm과 달리 뒤로 갈 화면이 없다).
export function TopicDraftRenameForm({
  title,
  existingLabels,
  onSubmit,
}: TopicDraftRenameFormProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(title);
  const trimmed = value.trim();
  const duplicate = isDuplicateLabelName(trimmed, existingLabels);
  const submittable = trimmed !== "" && !duplicate;

  function submit() {
    if (submittable) {
      onSubmit(trimmed);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={value}
        maxLength={TOPIC_TITLE_MAX_LENGTH}
        aria-label={t("review.topic_name_label")}
        aria-invalid={!submittable}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            submit();
          }
        }}
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
