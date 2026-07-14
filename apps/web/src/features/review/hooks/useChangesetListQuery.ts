import { CHANGESET_LIST_LIMIT_MAX } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

export function useChangesetListQuery() {
  return trpc.changeset.listChangesets.useQuery({
    limit: CHANGESET_LIST_LIMIT_MAX,
  });
}
