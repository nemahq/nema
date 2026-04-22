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

import { listHistories } from "@server/services/history-service";
import { protectedProcedure, router } from "@server/trpc";

// 호출 시점마다 새 인스턴스 — 스택 트레이스를 resolver 위치에 고정.
function notImplemented(procedure: string): TRPCError {
  return new TRPCError({
    code: "NOT_IMPLEMENTED",
    message: `history.${procedure} is not implemented yet — contract skeleton only.`,
  });
}

export const historyRouter = router({
  list: protectedProcedure
    .input(HistoryListInputSchema)
    .query(
      ({ ctx, input }): Promise<HistoryListOutput> =>
        listHistories(ctx.supabase, input),
    ),

  detail: protectedProcedure
    .input(HistoryDetailInputSchema)
    .query((): Promise<HistoryDetailOutput> => {
      throw notImplemented("detail");
    }),

  retryIngestion: protectedProcedure
    .input(RetryHistoryIngestionInputSchema)
    .mutation((): Promise<{ ok: true }> => {
      throw notImplemented("retryIngestion");
    }),

  onStatusUpdate: protectedProcedure
    .input(HistoryStatusSubscriptionInputSchema)
    .subscription(async function* (): AsyncGenerator<HistoryStatusEvent> {
      throw notImplemented("onStatusUpdate");
      // AsyncGenerator 타입 유지용 — throw로 도달하지 않음.
      yield* [] as HistoryStatusEvent[];
    }),
});
