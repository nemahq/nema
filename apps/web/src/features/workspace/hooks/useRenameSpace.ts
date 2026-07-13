import { trpc } from "@web/lib/trpc";

export function useRenameSpace() {
  const utils = trpc.useUtils();

  return trpc.space.rename.useMutation({
    async onMutate(input) {
      await utils.workspace.bootstrap.cancel();
      const previousBootstrap = utils.workspace.bootstrap.getData();

      utils.workspace.bootstrap.setData(undefined, (old) => {
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

      return { previousBootstrap };
    },
    onError(_err, _input, context) {
      if (context?.previousBootstrap) {
        utils.workspace.bootstrap.setData(undefined, context.previousBootstrap);
      }
    },
    onSettled() {
      utils.workspace.bootstrap.invalidate();
    },
  });
}
