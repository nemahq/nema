# Query Conventions

Rules for tRPC query and mutation hooks in `features/*/hooks/`.

## Query Hooks

### One hook per endpoint

Wrap at the **endpoint** level, not per property. Consumers extract what they need.

```ts
// O — one hook for session.get
export function useSessionSuspenseQuery(
  input: { sessionId: string },
  options?: Omit<Parameters<typeof trpc.session.get.useSuspenseQuery>[1], "queryKey">,
) {
  return trpc.session.get.useSuspenseQuery(input, {
    staleTime: SESSION_STALE_TIME_MS,
    ...options,
  });
}

// X — separate hooks per property
export function useSessionDraft({ sessionId }) { ... }
export function useSessionRetrieval({ sessionId }) { ... }
```

### Return the original tuple

Return `useSuspenseQuery` / `useQuery` result as-is. Do not extract or transform data inside the hook — consumers access `refetch`, `isRefetching`, `dataUpdatedAt` when needed.

```ts
// O
return trpc.session.get.useSuspenseQuery(input, { ... });

// X
const [session] = trpc.session.get.useSuspenseQuery(input, { ... });
return session.draft;
```

### Options override

Accept an optional second argument typed from tRPC's own inference, with `queryKey` omitted. Spread after defaults so consumers can override.

```ts
options?: Omit<Parameters<typeof trpc.xxx.useQuery>[1], "queryKey">
```

### Variants

Create only the variant that has a consumer. Do not pre-create both `useQuery` and `useSuspenseQuery`.

- Suspense only → `use{Endpoint}SuspenseQuery`
- Both needed → `use{Endpoint}Query` + `use{Endpoint}SuspenseQuery` in the same file

### File naming

`use{Endpoint}Query.ts` — even if only a Suspense variant exists.

### Cache utilities

Cache manipulation functions (`presetCache`, `addOptimistic`, `clearCache`) stay in the same file as the query hook they operate on.

## Mutation Hooks

### Callback separation

| Location | Responsibility |
| --- | --- |
| `useMutation({ onSuccess })` | Cache invalidation, cache update, analytics — **server state logic** |
| `mutate(data, { onSuccess })` | Toast, navigate, close dialog — **UI side-effects** |

UI side-effects MUST NOT live inside the mutation hook.

### Optimistic updates

Three required steps in every optimistic mutation:

1. **`onMutate`**: Cancel in-flight queries → snapshot previous data → apply optimistic update.
2. **`onError`**: Rollback to snapshot.
3. **`onSettled`**: Invalidate to re-sync with server (success or failure).

```ts
onMutate: async () => {
  await utils.session.get.cancel({ sessionId });
  const prev = utils.session.get.getData({ sessionId });
  utils.session.get.setData({ sessionId }, (old) => /* optimistic */);
  return { prev };
},
onError: (_err, _vars, context) => {
  if (context?.prev) {
    utils.session.get.setData({ sessionId }, context.prev);
  }
},
onSettled: () => {
  utils.session.get.invalidate({ sessionId });
},
```

Skipping `cancel` risks an in-flight refetch overwriting the optimistic update. Skipping `onSettled` risks stale cache after error rollback.
