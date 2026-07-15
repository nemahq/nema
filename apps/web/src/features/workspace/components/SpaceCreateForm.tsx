import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
import { isSpaceNameTaken } from "@web/features/workspace/isSpaceNameTaken";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { SpaceNameField } from "./SpaceNameField";

const NAME_INPUT_ID = "space-create-name";

interface SpaceCreateFormProps {
  onOpenChange: (open: boolean) => void;
}

export function SpaceCreateForm({ onOpenChange }: SpaceCreateFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: spaceList } = useSpaceList();
  const field = useSpaceNameField();
  const createMutation = useCreateSpace();
  const trimmedName = field.name.trim();
  const isEmpty = trimmedName === "";
  const isDuplicate =
    !isEmpty && isSpaceNameTaken(spaceList?.spaces ?? [], trimmedName);

  let nameError: string | null = null;
  if (field.touched && isEmpty) {
    nameError = t("common.name_required");
  } else if (isDuplicate) {
    nameError = t("common.name_taken");
  }

  function handleSubmit() {
    if (createMutation.isPending || isEmpty || isDuplicate) {
      return;
    }

    createMutation.mutate(
      { name: trimmedName },
      {
        // 여기서 한 번 더 기다리는 이유: space.list에 새 Space가 반영되기
        // 전에 navigate하면 SpaceOverview가 "존재하지 않음"을 잠깐 flash한다 —
        // 이 화면 전환이 필요로 하는 것이지 useCreateSpace 자체의 책임은 아니라
        // 여기서 명시적으로 기다린다(훅의 자체 invalidate와 중복 호출되지만
        // TanStack이 같은 쿼리 키 refetch를 dedupe해 실제로는 한 번만 나간다 —
        // dedupe가 안 되는 타이밍이어도 정확성엔 문제없고 낭비 요청 하나만 늘 뿐).
        onSuccess: async ({ publicId }) => {
          await utils.space.list.invalidate();
          onOpenChange(false);
          navigate({
            to: "/space/$spacePublicId",
            params: { spacePublicId: publicId },
          });
        },
        onError: field.markConflictIfNameTaken,
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.create_title")}</DialogTitle>
      </DialogHeader>

      <SpaceNameField
        id={NAME_INPUT_ID}
        value={field.name}
        onChange={field.handleChange}
        onEnter={handleSubmit}
        error={nameError}
        hasConflict={field.hasConflict}
      />

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending || isEmpty || isDuplicate}
        >
          {createMutation.isPendingAfterDelay
            ? t("common.creating")
            : t("common.create")}
        </Button>
      </DialogFooter>
    </>
  );
}
