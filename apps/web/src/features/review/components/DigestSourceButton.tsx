import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface DigestSourceButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

// 원문 보기는 리뷰 작업의 핵심(원문 대조)이라 ⋯ 뒤에 숨기지 않는다. 아이콘이 텍스트
// 없이 혼자 의미를 전달해야 해서, 이 앱이 이미 "문서" 의미로 쓰는 FileText를
// 재사용한다 — Search는 같은 앱에서 "검색 쿼리"라는 다른 뜻으로 이미 쓰인다.
export function DigestSourceButton({
  active,
  disabled,
  onClick,
}: DigestSourceButtonProps) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          shape="circle"
          disabled={disabled}
          aria-label={t("review.digest_view_source_action")}
          onClick={onClick}
          className={cn(
            "text-fg-tertiary",
            active && "bg-fg-primary/10 text-fg-primary",
          )}
        >
          <FileText className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t("review.digest_view_source_action")}
      </TooltipContent>
    </Tooltip>
  );
}
