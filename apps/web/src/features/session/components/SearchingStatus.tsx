import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useTranslation } from "@web/lib/tolgee";

import { StatusIndicator } from "./StatusIndicator";

const MAX_VISIBLE_ENTITIES = 2;

function formatEntities(
  entities: string[],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const visible = entities.slice(0, MAX_VISIBLE_ENTITIES).join(", ");
  const overflow = entities.length - MAX_VISIBLE_ENTITIES;
  return overflow > 0
    ? `${visible} ${t("common.overflow_count", { count: overflow })}`
    : visible;
}

export function SearchingStatus() {
  const { t } = useTranslation();
  const { searchEntities } = useChatLifecycle();

  const label =
    searchEntities.length > 0
      ? t("session.status_searching_with_entities", {
          entities: formatEntities(searchEntities, t),
        })
      : t("session.status_searching");

  return <StatusIndicator label={label} status="in-progress" />;
}
