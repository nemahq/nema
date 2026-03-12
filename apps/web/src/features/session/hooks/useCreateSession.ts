import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

function prependSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  newSession: { id: string },
) {
  utils.session.list.setInfiniteData({ limit: SESSION_LIST_LIMIT }, (old) => {
    if (!old?.pages[0]) return old;
    const [firstPage, ...rest] = old.pages;
    return {
      ...old,
      pages: [
        { ...firstPage, items: [newSession, ...firstPage.items] },
        ...rest,
      ],
    };
  });
}

export function useCreateSession() {
  const utils = trpc.useUtils();

  return trpc.session.create.useMutation({
    onSuccess(newSession) {
      prependSessionCache(utils, newSession);
    },
  });
}
