import { useTranslation } from "@web/lib/tolgee";

import { StatusIndicator } from "./StatusIndicator";

const MAX_VISIBLE_ENTITIES = 2;

interface SearchingStatusProps {
  entities: string[];
}

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

export function SearchingStatus({ entities }: SearchingStatusProps) {
  const { t } = useTranslation();

  const label =
    entities.length > 0
      ? t("session.status_searching_with_entities", {
          entities: formatEntities(entities, t),
        })
      : t("session.status_searching");

  return <StatusIndicator label={label} inProgress />;
}
