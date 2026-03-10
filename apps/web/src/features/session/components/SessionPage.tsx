import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { UserMenu } from "./UserMenu";

function NewContextButton({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();

  const icon = (
    <div className="flex size-6 items-center justify-center rounded-full bg-brand/15 text-brand dark:bg-fg-primary/10 dark:text-fg-primary">
      <Plus strokeWidth={1.5} className="size-4" />
    </div>
  );

  if (collapsed) {
    return (
      <div className="flex justify-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center cursor-pointer rounded-md transition-colors duration-fast hover:bg-surface-raised-hover"
              onClick={() => {
                // TODO: 세션 생성 API 연결
              }}
            >
              {icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t("session.new_context")}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-1.5 py-2">
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 pl-1.5 text-sm font-medium"
        onClick={() => {
          // TODO: 세션 생성 API 연결
        }}
      >
        {icon}
        {t("session.new_context")}
      </Button>
    </div>
  );
}

export function SessionPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh">
      <Sidebar
        footer={(collapsed) => <UserMenu collapsed={collapsed} />}
      >
        {(collapsed) => <NewContextButton collapsed={collapsed} />}
      </Sidebar>

      <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
        <p className="text-fg-tertiary">{t("session.empty")}</p>
      </main>
    </div>
  );
}
