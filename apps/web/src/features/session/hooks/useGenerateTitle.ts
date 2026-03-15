import type { SessionGenerateTitleInput } from "@nema-io/shared";

import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

export function useGenerateTitle() {
  const utils = trpc.useUtils();

  return trpc.session.generateTitle.useMutation({
    onSuccess(title, input: SessionGenerateTitleInput) {
      if (!title) {
        return;
      }
      utils.session.list.setInfiniteData(
        { limit: SESSION_LIST_LIMIT },
        (old) => {
          if (!old) {
            return old;
          }
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((s) =>
                s.id === input.sessionId ? { ...s, title } : s,
              ),
            })),
          };
        },
      );
    },
  });
}
