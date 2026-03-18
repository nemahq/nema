import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";

vi.mock("./chat/saving", () => ({ handleSave: vi.fn() }));
vi.mock("@server/infra/save-job-emitter", () => ({
  emitSaveJobUpdate: vi.fn(),
}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/node";

import { emitSaveJobUpdate } from "@server/infra/save-job-emitter";

import { handleSave } from "./chat/saving";
import { enqueueSaveJob, processSaveJobBackground } from "./save-job-service";

const JOB_ID = "a0000000-0000-4000-8000-000000000001";
const SESSION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "a0000000-0000-4000-8000-000000000003";
const TIMESTAMP = "2026-01-01T00:00:00.000Z";

function createChain(resolved: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolved));
  return chain;
}

function makeJobRow(overrides?: Record<string, unknown>) {
  return {
    id: JOB_ID,
    session_id: SESSION_ID,
    status: "pending",
    error_message: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueSaveJob", () => {
  it("드래프트 없으면 TRPCError(NOT_FOUND) throw", async () => {
    const from = vi
      .fn()
      .mockReturnValue(createChain({ data: { draft: null }, error: null }));
    const supabase = { from } as unknown as TypedSupabaseClient;

    await expect(
      enqueueSaveJob({ supabase, userId: USER_ID, sessionId: SESSION_ID }),
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("드래프트 있으면 job 생성 후 draft 클리어", async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createChain({ data: { draft: { body: "test draft" } }, error: null }),
      )
      .mockReturnValueOnce(createChain({ data: makeJobRow(), error: null }))
      .mockReturnValueOnce(createChain({ error: null }));

    const supabase = { from } as unknown as TypedSupabaseClient;

    const result = await enqueueSaveJob({
      supabase,
      userId: USER_ID,
      sessionId: SESSION_ID,
    });

    expect(result.id).toBe(JOB_ID);
    expect(result.status).toBe("pending");
    expect(from).toHaveBeenCalledTimes(3);
  });
});

describe("processSaveJobBackground", () => {
  it("handleSave 성공 시 completed SSE 발행", async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(createChain({ error: null }))
      .mockReturnValueOnce(
        createChain({
          data: { draft_body: "test", session_id: SESSION_ID },
          error: null,
        }),
      )
      .mockReturnValueOnce(createChain({ error: null }))
      .mockReturnValueOnce(
        createChain({
          data: makeJobRow({ status: "completed" }),
          error: null,
        }),
      );

    const supabase = { from } as unknown as TypedSupabaseClient;
    vi.mocked(handleSave).mockResolvedValue(undefined);

    await processSaveJobBackground({
      supabase,
      providers: {} as Providers,
      userId: USER_ID,
      jobId: JOB_ID,
    });

    expect(emitSaveJobUpdate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ id: JOB_ID, status: "completed" }),
    );
  });

  it("handleSave 실패 시 failed SSE 발행 + Sentry 보고", async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(createChain({ error: null }))
      .mockReturnValueOnce(
        createChain({
          data: { draft_body: "test", session_id: SESSION_ID },
          error: null,
        }),
      )
      .mockReturnValueOnce(createChain({ error: null }))
      .mockReturnValueOnce(
        createChain({
          data: makeJobRow({
            status: "failed",
            error_message: "LLM failed",
          }),
          error: null,
        }),
      );

    const supabase = { from } as unknown as TypedSupabaseClient;
    vi.mocked(handleSave).mockRejectedValue(new Error("LLM failed"));

    await processSaveJobBackground({
      supabase,
      providers: {} as Providers,
      userId: USER_ID,
      jobId: JOB_ID,
    });

    expect(emitSaveJobUpdate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ id: JOB_ID, status: "failed" }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { component: "save-job" },
      }),
    );
  });
});
