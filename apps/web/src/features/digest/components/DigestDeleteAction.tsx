import { DeleteConfirmAction } from "@web/components/ui/DeleteConfirmAction";
import { useDeleteDigest } from "@web/features/digest/hooks/useDeleteDigest";
import { useTranslation } from "@web/lib/tolgee";

interface DigestDeleteActionProps {
  digestId: string;
  onDeleted: () => void;
}

// 되살리는 화면이 없어 사용자에게는 영구 삭제다 — 확인 문구도 그렇게 말한다.
export function DigestDeleteAction({
  digestId,
  onDeleted,
}: DigestDeleteActionProps) {
  const { t } = useTranslation();
  const deleteDigest = useDeleteDigest();

  function handleConfirm(closeDialog: () => void) {
    deleteDigest.mutate(
      { digestId },
      {
        onSuccess: () => {
          closeDialog();
          onDeleted();
        },
      },
    );
  }

  return (
    <DeleteConfirmAction
      confirmTitle={t("digest.delete_confirm_title")}
      confirmDescription={t("digest.delete_confirm_description")}
      isPending={deleteDigest.isPending}
      isPendingAfterDelay={deleteDigest.isPendingAfterDelay}
      onConfirm={handleConfirm}
    />
  );
}
