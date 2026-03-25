import { Link } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";
import { Home } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export function NotFoundErrorFallback() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-fg-tertiary">{t("error.not_found")}</p>
      <Button variant="ghost" size="sm" asChild>
        <Link to="/">
          <Home className="size-3.5" />
          {t("error.go_home")}
        </Link>
      </Button>
    </div>
  );
}
