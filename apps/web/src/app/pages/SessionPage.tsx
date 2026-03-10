import { SessionSidebar } from "@web/features/session/components/SessionSidebar";
import { useTranslation } from "@web/lib/tolgee";

export function SessionPage() {
  const { t } = useTranslation();

  return (
    <>
      <SessionSidebar />

      <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
        <p className="text-fg-tertiary">{t("session.empty")}</p>
      </main>
    </>
  );
}
