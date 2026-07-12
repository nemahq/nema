import { useTranslation } from "@web/lib/tolgee";

// v2 IA 재구축 전까지의 임시 화면 — 실제 홈 화면이 만들어지면 교체된다.
export function WorkspaceHome() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 items-center justify-center bg-surface-card">
      <p className="text-sm text-fg-tertiary">{t("common.home")}</p>
    </main>
  );
}
