import type { ReactNode } from "react";

import { Alert, Button, DialogFooter, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface AccountDeleteConfirmShellProps {
  onBack: () => void;
  cancelDisabled?: boolean;
  deleteDisabled: boolean;
  deleteLabel: string;
  onConfirmDelete?: () => void;
  children: ReactNode;
}

// 제목·경고 배너·footer는 차단 여부 조회와 무관하게 항상 같은 모양이라, 로딩 중
// fallback과 실제 화면이 이 shell을 그대로 공유한다 — 데이터 의존 영역(필드)만
// children으로 갈아끼운다.
export function AccountDeleteConfirmShell({
  onBack,
  cancelDisabled,
  deleteDisabled,
  deleteLabel,
  onConfirmDelete,
  children,
}: AccountDeleteConfirmShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <Text as="h2" size="lg" bold>
        {t("account.delete_confirm_title")}
      </Text>

      <div className="mt-4 flex flex-1 flex-col gap-4">
        <Alert variant="error" icon={false}>
          {t("account.delete_confirm_description")}
        </Alert>
        {children}
      </div>

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack} disabled={cancelDisabled}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={onConfirmDelete}
          disabled={deleteDisabled}
        >
          {deleteLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}
