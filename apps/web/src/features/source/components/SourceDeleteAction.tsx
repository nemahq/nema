import { DeleteConfirmAction } from "@web/components/ui/DeleteConfirmAction";
import { useDeleteSource } from "@web/features/source/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface SourceDeleteActionProps {
  sourceId: string;
  onDeleted: () => void;
}

// 하드 삭제 + CASCADE라 되돌릴 수 없다 — 확인 문구가 그 사실을 말한다.
export function SourceDeleteAction({
  sourceId,
  onDeleted,
}: SourceDeleteActionProps) {
  const { t } = useTranslation();
  const deleteSource = useDeleteSource();

  function handleConfirm(closeDialog: () => void) {
    deleteSource.mutate(
      { sourceId },
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
      confirmTitle={t("source.delete_confirm_title")}
      confirmDescription={t("source.delete_confirm_description")}
      isPending={deleteSource.isPending}
      isPendingAfterDelay={deleteSource.isPendingAfterDelay}
      onConfirm={handleConfirm}
    />
  );
}
