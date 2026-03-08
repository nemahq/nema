import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { useTranslation } from "@web/lib/tolgee";

export function LegalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        to="/signin"
        search={{ redirect: undefined }}
        className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; {t("auth.back")}
      </Link>
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        {children}
      </article>
    </div>
  );
}
