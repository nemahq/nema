import { Badge, Skeleton } from "@nema-io/weave";

import { TaskOverrideRow } from "@web/features/dev-harness/components/TaskOverrideRow";
import { useTaskModelsQuery } from "@web/features/dev-harness/hooks/useTaskModelsQuery";
import type { LlmTaskName } from "@web/features/dev-harness/types";

export function TaskOverridesSection() {
  const taskQuery = useTaskModelsQuery();
  const taskModels = taskQuery.data;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-fg-tertiary">
          task별 모델 override
        </h3>
        <Badge variant="neutral">override 우선</Badge>
      </div>
      <p className="text-xs text-fg-tertiary">
        메모리 전용 — 서버 재시작하면 전부 tier 기본으로 초기화된다.
      </p>
      {taskQuery.isError && (
        <p className="text-xs text-status-error">모델 목록을 못 불러왔다.</p>
      )}
      {!taskQuery.isError &&
        (taskModels ? (
          <div className="flex flex-col gap-2">
            {(Object.keys(taskModels.overrides) as LlmTaskName[]).map(
              (task) => (
                <TaskOverrideRow key={task} task={task} />
              ),
            )}
          </div>
        ) : (
          <Skeleton className="h-64 w-full" />
        ))}
    </div>
  );
}
