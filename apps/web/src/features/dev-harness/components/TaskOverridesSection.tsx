import { Badge, Skeleton } from "@nema-io/weave";

import { TaskOverrideRow } from "@web/features/dev-harness/components/TaskOverrideRow";
import { useTaskModelsQuery } from "@web/features/dev-harness/hooks/useTaskModelsQuery";
import type { LlmTaskName } from "@web/features/dev-harness/types";

export function TaskOverridesSection() {
  const taskQuery = useTaskModelsQuery();
  const overrides = taskQuery.data?.overrides;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-fg-tertiary">
          task별 모델 override
        </h3>
        <Badge variant="neutral">override 우선</Badge>
      </div>
      {overrides ? (
        <div className="flex flex-col gap-2">
          {(Object.keys(overrides) as LlmTaskName[]).map((task) => (
            <TaskOverrideRow key={task} task={task} />
          ))}
        </div>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  );
}
