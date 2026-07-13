import { trpc } from "@web/lib/trpc";

export function useRenameSpace() {
  const utils = trpc.useUtils();

  return trpc.space.rename.useMutation({
    async onMutate(input) {
      await utils.space.list.cancel();
      const previousSpaceList = utils.space.list.getData();

      utils.space.list.setData(undefined, (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          spaces: old.spaces.map((space) =>
            space.id === input.spaceId ? { ...space, name: input.name } : space,
          ),
        };
      });

      return { previousSpaceList };
    },
    onError(_err, _input, context) {
      if (context?.previousSpaceList) {
        utils.space.list.setData(undefined, context.previousSpaceList);
      }
    },
    onSettled() {
      utils.space.list.invalidate();
    },
  });
}
