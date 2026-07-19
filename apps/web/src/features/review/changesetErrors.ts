import { TRPCClientError } from "@trpc/client";

export function isChangesetNotFound(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
}
