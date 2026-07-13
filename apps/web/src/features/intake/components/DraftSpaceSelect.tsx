import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useReassignSourceSpace } from "@web/features/intake/hooks/useReassignSourceSpace";
import { useSpaceList } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface DraftSpaceSelectProps {
  sourceId: string;
  spaceId: string;
}

export function DraftSpaceSelect({ sourceId, spaceId }: DraftSpaceSelectProps) {
  const { t } = useTranslation();
  const spaceListQuery = useSpaceList();
  const reassignMutation = useReassignSourceSpace();

  function handleValueChange(nextSpaceId: string) {
    if (nextSpaceId === spaceId) {
      return;
    }
    reassignMutation.mutate({ sourceId, spaceId: nextSpaceId });
  }

  return (
    <Select
      value={spaceId}
      onValueChange={handleValueChange}
      disabled={reassignMutation.isPending}
    >
      <SelectTrigger
        aria-label={t("intake.draft_reassign_space")}
        className="h-8 w-36 cursor-pointer text-xs shadow-none dark:shadow-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(spaceListQuery.data?.spaces ?? []).map((space) => (
          <SelectItem
            key={space.id}
            value={space.id}
            className="cursor-pointer"
          >
            {space.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
