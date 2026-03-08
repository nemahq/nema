import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

export function SessionPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh">
      <Sidebar />

      <main className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted-foreground">{t("session.empty")}</p>
      </main>
    </div>
  );
}
