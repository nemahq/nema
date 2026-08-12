# Query Conventions

Rules for tRPC query and mutation hooks in `features/*/hooks/`.

Server state lives here, in the TanStack Query cache — never copied into a store, not even as an "immutable snapshot" to diff local edits against. A copy silently stops tracking refetches (`staleTime` expiry, window focus, post-mutation invalidation), so the screen keeps rendering the payload it started with.

### Editable server state (drafts)

When the user edits a server payload before saving it, edit the cache entry itself with `setQueryData` — do not layer a separate edit state over it. One value answers "what does it look like now", which is what saving (send it whole) and undo (restore a previous one) both need; a baseline + per-field overrides answers it only by recombining them at every read.

Such a query MUST opt out of every automatic refetch axis (`staleTime`, window focus, reconnect, mount) AND every automatic eviction axis (`gcTime`) — a query with no observers (screen navigated away from) still falls out of the cache on the default `gcTime` even with refetching fully disabled, so the edit is gone by the time the user comes back. Refetch only by explicit invalidation after a save. Check that no other mutation's `invalidate` range covers this query key.

## Query Hooks

### One hook per endpoint

Wrap at the **endpoint** level, not per property. Consumers extract what they need.

```ts
// O — one hook for digest.get
export function useDigestSuspenseQuery(
  input: { digestId: string },
  options?: Omit<Parameters<typeof trpc.digest.get.useSuspenseQuery>[1], "queryKey">,
) {
  return trpc.digest.get.useSuspenseQuery(input, {
    staleTime: DIGEST_STALE_TIME_MS,
    ...options,
  });
}

// X — separate hooks per property
export function useDigestTitle({ digestId }) { ... }
export function useDigestStatements({ digestId }) { ... }
```

### Return the original tuple

Return `useSuspenseQuery` / `useQuery` result as-is. Do not extract or transform data inside the hook — consumers access `refetch`, `isRefetching`, `dataUpdatedAt` when needed.

```ts
// O
return trpc.digest.get.useSuspenseQuery(input, { ... });

// X
const [digest] = trpc.digest.get.useSuspenseQuery(input, { ... });
return digest.statements;
```

### Options override

Accept an optional second argument typed from tRPC's own inference, with `queryKey` omitted. Spread after defaults so consumers can override.

```ts
options?: Omit<Parameters<typeof trpc.xxx.useQuery>[1], "queryKey">
```

### Variants

Create only the variant that has a consumer. Do not pre-create both `useQuery` and `useSuspenseQuery`.

- Suspense only → `use{Entity}SuspenseQuery`
- Both needed → `use{Entity}Query` + `use{Entity}SuspenseQuery` in the same file

### File naming

`use{Entity}Query.ts` — even if only a Suspense variant exists.

### Cache utilities

Cache manipulation functions (`presetCache`, `addOptimistic`, `clearCache`) stay in the same file as the query hook they operate on.

## Mutation Hooks

### Callback separation

| Location | Responsibility |
| --- | --- |
| `useMutation({ onSuccess })` | Cache invalidation, cache update — **server state logic** |
| `mutate(data, { onSuccess })` | Navigate, close dialog — **UI side-effects** |

UI side-effects MUST NOT live inside the mutation hook.

**Exception — state the mutation owns end-to-end**: `mutate(data, { onSuccess })` callbacks are skipped entirely if the calling component has already unmounted before the mutation settles. When a side effect must run regardless (e.g. clearing a component-local draft that mirrors this exact mutation's lifecycle, so it can't resurrect after the caller unmounts), put it in `useMutation({ onMutate/onError/onSuccess })` instead. This is narrow: it applies only to state the mutation itself fully owns, not general UI reactions like navigation or closing a dialog — those still belong at the call site.

**Error toast**: The global `MutationCache.onError` shows a toast for all mutation errors by default. Individual toast handling is unnecessary. To suppress the global toast (e.g., when showing a custom error UI), set `meta: { skipGlobalToast: true }` on the mutation.

### Optimistic updates

Three required steps in every optimistic mutation:

1. **`onMutate`**: Cancel in-flight queries → snapshot previous data → apply optimistic update.
2. **`onError`**: Rollback to snapshot.
3. **`onSettled`**: Invalidate to re-sync with server (success or failure).

```ts
onMutate: async () => {
  await utils.digest.get.cancel({ digestId });
  const prev = utils.digest.get.getData({ digestId });
  utils.digest.get.setData({ digestId }, (old) => /* optimistic */);
  return { prev };
},
onError: (_err, _vars, context) => {
  if (context?.prev) {
    utils.digest.get.setData({ digestId }, context.prev);
  }
},
onSettled: () => {
  utils.digest.get.invalidate({ digestId });
},
```

Skipping `cancel` risks an in-flight refetch overwriting the optimistic update. Skipping `onSettled` risks stale cache after error rollback.
