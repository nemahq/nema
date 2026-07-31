import { useEffect, useRef, useState } from "react";

import { TOPIC_TITLE_MAX_LENGTH } from "@nema-io/shared";
import { FormControl, FormField, FormMessage, Input } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface TopicDraftRenameFormProps {
  title: string;
  // 배열이 아니라 콜백으로 받는 이유 — 비교 대상 목록은 conventions.md 원시값
  // prop 규칙상 배열로 못 받는다(콜백은 예외). 입력값이 바뀔 때마다(키 입력마다)
  // 이 폼 안에서만 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수도
  // 없다(TagCreateForm의 정적 title과 다름).
  isDuplicateTitle: (title: string) => boolean;
  // 저장 버튼이 없다 — 팝오버가 닫힐 때(바깥 클릭 등)만 유효한 값이 커밋된다
  // (TagDraftRenameForm과 같은 원칙).
  onCommitText: (title: string) => void;
}

// 신규(draft) Topic 자신의 이름만 고친다 — 기존 레지스트리 Topic 인라인 수정은
// 대상이 아니다(PR #506 컨센서스, review-flow.md).
export function TopicDraftRenameForm({
  title,
  isDuplicateTitle,
  onCommitText,
}: TopicDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const trimmedTitle = titleValue.trim();
  const duplicate = isDuplicateTitle(trimmedTitle);
  const submittable = trimmedTitle !== "" && !duplicate;

  // TagDraftRenameForm과 같은 언마운트-커밋 패턴 — 상세 이유(초깃값과 비교해 실제
  // 변경 시에만 커밋하는 이유 포함)는 그쪽 주석 참고.
  const [initialTitle] = useState(title);
  const latestRef = useRef({ trimmedTitle, submittable, onCommitText });
  useEffect(function syncLatest() {
    latestRef.current = { trimmedTitle, submittable, onCommitText };
  });
  useEffect(
    function commitOnClose() {
      return () => {
        const latest = latestRef.current;
        const changed = latest.trimmedTitle !== initialTitle;
        if (latest.submittable && changed) {
          latest.onCommitText(latest.trimmedTitle);
        }
      };
    },
    [initialTitle],
  );

  function getTitleError() {
    if (trimmedTitle === "") {
      return t("common.name_required");
    }
    if (duplicate) {
      return t("common.name_taken");
    }
    return null;
  }
  const titleError = getTitleError();

  return (
    <div className="flex flex-col gap-2 px-2">
      <FormField>
        <FormControl>
          <Input
            autoFocus
            value={titleValue}
            maxLength={TOPIC_TITLE_MAX_LENGTH}
            placeholder={t("common.name_placeholder")}
            aria-label={t("common.name_label")}
            aria-invalid={!submittable}
            onChange={(e) => setTitleValue(e.target.value)}
          />
        </FormControl>
        <FormMessage reserveSpace errorPrefix={t("common.error_prefix")}>
          {titleError}
        </FormMessage>
      </FormField>
    </div>
  );
}
