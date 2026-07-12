import { cn, Skeleton } from "@nema-io/weave";

import { useModelPresetQuery } from "@web/features/dev-harness/hooks/useModelPresetQuery";
import { useSetModelPreset } from "@web/features/dev-harness/hooks/useSetModelPreset";
import type { ModelPresetName } from "@web/features/dev-harness/types";

const PRESETS: { id: ModelPresetName; hint: string }[] = [
  { id: "all-nano", hint: "전 tier를 nano로 — 가장 싸게" },
  { id: "real-tiers", hint: "standard/mini/nano 그대로" },
];

const TIER_ORDER = ["standard", "mini", "nano"] as const;

// 자체적으로 프리셋 쿼리·뮤테이션을 소유해 부모에 객체 프롭을 넘기지 않는다.
export function PresetSection() {
  const presetQuery = useModelPresetQuery();
  const setPreset = useSetModelPreset();
  const info = presetQuery.data;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-fg-tertiary">프리셋</h3>
      {presetQuery.isError && (
        <p className="text-xs text-status-error">프리셋을 못 불러왔다.</p>
      )}
      {!presetQuery.isError &&
        (info ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {PRESETS.map((preset) => {
                const active = preset.id === info.preset;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={setPreset.isPending}
                    onClick={() => setPreset.mutate({ preset: preset.id })}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left disabled:opacity-50",
                      active
                        ? "border-brand-accent bg-brand-tint"
                        : "border-border/60 hover:border-border-strong",
                    )}
                  >
                    <span className="font-mono text-sm text-fg-primary">
                      {preset.id}
                    </span>
                    <span className="text-xs text-fg-tertiary">
                      {preset.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-surface-card px-3 py-2">
              <span className="text-xs font-semibold text-fg-tertiary">
                현재 tier resolve
              </span>
              {TIER_ORDER.map((tier) => (
                <div
                  key={tier}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-fg-secondary">{tier}</span>
                  <span className="font-mono text-fg-primary">
                    {info.models[tier]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Skeleton className="h-28 w-full" />
        ))}
    </div>
  );
}
