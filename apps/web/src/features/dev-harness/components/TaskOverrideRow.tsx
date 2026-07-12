import {
  Badge,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { useClearTaskModel } from "@web/features/dev-harness/hooks/useClearTaskModel";
import { useSetTaskModel } from "@web/features/dev-harness/hooks/useSetTaskModel";
import { useTaskModelsQuery } from "@web/features/dev-harness/hooks/useTaskModelsQuery";
import type {
  LlmTaskName,
  ModelCatalogEntry,
} from "@web/features/dev-harness/types";

// Radix Select는 빈 문자열 value를 허용하지 않아, "override 해제"를 별도 센티널로 표현한다.
const TIER_DEFAULT_VALUE = "__tier_default__";

function formatPrice(entry: ModelCatalogEntry): string {
  if (!entry.pricing) {
    return "단가 미상";
  }
  return `$${entry.pricing.inputPerMTok}/$${entry.pricing.outputPerMTok}`;
}

function groupByProvider(
  catalog: ModelCatalogEntry[],
): Map<string, ModelCatalogEntry[]> {
  const byProvider = new Map<string, ModelCatalogEntry[]>();
  for (const entry of catalog) {
    const bucket = byProvider.get(entry.provider) ?? [];
    bucket.push(entry);
    byProvider.set(entry.provider, bucket);
  }
  return byProvider;
}

interface TaskOverrideRowProps {
  task: LlmTaskName;
}

// 카탈로그·현재 override는 프롭이 아니라 자체 쿼리에서 읽는다(React Query가 캐시로 dedupe).
// 프롭을 primitive(task)로 좁혀 객체 프롭 금지 규칙을 지킨다.
export function TaskOverrideRow({ task }: TaskOverrideRowProps) {
  const taskQuery = useTaskModelsQuery();
  const setTaskModel = useSetTaskModel();
  const clearTaskModel = useClearTaskModel();

  const taskModels = taskQuery.data;
  if (!taskModels) {
    return null;
  }

  const override = taskModels.overrides[task];
  const pending = setTaskModel.isPending || clearTaskModel.isPending;

  function handleChange(value: string) {
    if (value === TIER_DEFAULT_VALUE) {
      clearTaskModel.mutate({ task });
      return;
    }
    setTaskModel.mutate({ task, modelId: value });
  }

  const byProvider = groupByProvider(taskModels.catalog);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-surface-card px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-sm text-fg-primary">
          {task}
        </span>
        {override ? (
          <Badge variant="brand">override</Badge>
        ) : (
          <span className="text-xs text-fg-tertiary">tier 기본</span>
        )}
      </div>

      <Select
        value={override ?? TIER_DEFAULT_VALUE}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger className="w-72 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TIER_DEFAULT_VALUE}>
            tier 기본 (override 해제)
          </SelectItem>
          {[...byProvider].map(([provider, entries]) => (
            <SelectGroup key={provider}>
              <SelectLabel>{provider}</SelectLabel>
              {entries.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.id} · {formatPrice(entry)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
