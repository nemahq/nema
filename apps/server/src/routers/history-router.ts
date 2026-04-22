import { TRPCError } from "@trpc/server";

import {
  HistoryDetailInputSchema,
  type HistoryDetailOutput,
  HistoryListInputSchema,
  type HistoryListOutput,
  type HistoryStatusEvent,
  HistoryStatusSubscriptionInputSchema,
  RetryHistoryIngestionInputSchema,
} from "@nema-io/shared";

import { protectedProcedure, router } from "@server/trpc";

const NOT_IMPLEMENTED = new TRPCError({
  code: "INTERNAL_SERVER_ERROR",
  message: "Not implemented yet — contract skeleton only.",
});

export const historyRouter = router({
  list: protectedProcedure
    .input(HistoryListInputSchema)
    .query((): Promise<HistoryListOutput> => {
      throw NOT_IMPLEMENTED;
    }),

  detail: protectedProcedure
    .input(HistoryDetailInputSchema)
    .query((): Promise<HistoryDetailOutput> => {
      throw NOT_IMPLEMENTED;
    }),

  retryIngestion: protectedProcedure
    .input(RetryHistoryIngestionInputSchema)
    .mutation((): Promise<{ ok: true }> => {
      throw NOT_IMPLEMENTED;
    }),

  onStatusUpdate: protectedProcedure
    .input(HistoryStatusSubscriptionInputSchema)
    .subscription(async function* (): AsyncGenerator<HistoryStatusEvent> {
      throw NOT_IMPLEMENTED;
      yield* [] as HistoryStatusEvent[];
    }),
});
