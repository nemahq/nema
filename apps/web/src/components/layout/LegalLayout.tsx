import type { ReactNode } from "react";

import { useTranslation } from "@web/lib/tolgee";

export function LegalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; {t("auth.back")}
      </button>
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        {children}
      </article>
    </div>
  );
}
