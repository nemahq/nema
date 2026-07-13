import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useCreateSpace } from "@web/features/workspace/hooks/useCreateSpace";
import { useSpaceNameField } from "@web/features/workspace/hooks/useSpaceNameField";
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
  const field = useSpaceNameField();
  const createMutation = useCreateSpace();
  const isEmpty = field.name.trim() === "";

  function handleSubmit() {
    if (createMutation.isPending) {
      return;
    }
    const trimmed = field.validate();
    if (!trimmed) {
      return;
    }

    createMutation.mutate(
      { name: trimmed },
      {
        // 여기서 한 번 더 기다리는 이유: bootstrap.spaces에 새 Space가 반영되기
        // 전에 navigate하면 SpaceOverview가 "존재하지 않음"을 잠깐 flash한다 —
        // 이 화면 전환이 필요로 하는 것이지 useCreateSpace 자체의 책임은 아니라
        // 여기서 명시적으로 기다린다(훅의 자체 invalidate와 중복 호출되지만
        // TanStack이 같은 쿼리 키 refetch를 dedupe해 실제로는 한 번만 나간다).
        onSuccess: async ({ spaceId }) => {
          await utils.workspace.bootstrap.invalidate();
          onOpenChange(false);
          navigate({ to: "/space/$spaceId", params: { spaceId } });
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
        error={field.validationError}
        hasConflict={field.hasConflict}
      />

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending || isEmpty}
        >
          {t("space.create_action")}
        </Button>
      </DialogFooter>
    </>
  );
}
