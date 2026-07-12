import { PresetSection } from "@web/features/dev-harness/components/PresetSection";
import { TaskOverridesSection } from "@web/features/dev-harness/components/TaskOverridesSection";

// 내부 조종석 — LLM 라우팅 3층(tier 프리셋·task override)을 런타임에 만져본다.
// 프로덕션에서는 dev-router가 NOT_FOUND라 이 탭 자체가 뜨지 않는다.
export function ModelSettingsPanel() {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-fg-primary">모델 설정</h2>
        <p className="text-xs text-fg-tertiary">
          로컬·스테이징 전용. 프리셋으로 tier 기본을, task override로 개별
          동작의 모델을 갈아끼운다.
        </p>
      </header>

      <PresetSection />
      <TaskOverridesSection />
    </section>
  );
}
