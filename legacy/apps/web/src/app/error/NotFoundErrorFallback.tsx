import { Link } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";
import { Home } from "@nema-io/weave/icons";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useTranslation } from "@web/lib/tolgee";

export function NotFoundErrorFallback() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 p-8">
      <NemaMarkIcon
        width={32}
        height={39}
        className="mb-4 fill-teal-500 dark:fill-fg-primary"
      />
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
