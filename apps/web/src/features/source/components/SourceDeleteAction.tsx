import { DeleteConfirmAction } from "@web/components/ui/DeleteConfirmAction";
import { useDeleteSource } from "@web/features/source/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface SourceDeleteActionProps {
  // 상세 헤더는 조회(source.get) 페칭과 분리돼 있어, 그 응답이 아직 없는 동안은
  // 삭제에 쓸 내부 id도 없다(SourceDetailPanel 참고) — 그 구간엔 undefined.
  sourceId: string | undefined;
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
    if (!sourceId) {
      return;
    }
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
      disabled={sourceId === undefined}
      onConfirm={handleConfirm}
    />
  );
}
