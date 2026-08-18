import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import {
  MCP_CLIENT_HEADER_NAME,
  MCP_CLIENT_HEADER_VALUE,
} from "@nema-io/shared";

// onTRPCError의 캡처 분기(EXPECTED_DOMAIN_CODES 판정)는 이 PR이 고치려는 문제와
// 정확히 같은 자리라, 실제 도메인 에러 타입(SupabaseError·LlmError)으로 회귀를 막는다.
const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));
vi.mock("@server/infra/monitoring", () => ({
  captureException: captureExceptionMock,
}));

import { LlmError } from "@server/infra/llm/llm-error";
import { SupabaseError } from "@server/infra/supabase/supabase-error";
import { createContext, onTRPCError } from "@server/trpc";

function fakeReq() {
  return { log: { error: vi.fn() } };
}

// Authorization 헤더를 안 실으면 createContext가 getSupabaseAdmin()(→getEnv())을
// 안 타므로, 이 스위트는 origin 판정 로직만 env 없이 순수하게 검증한다.
function fakeOptions(
  headers: Record<string, string>,
): CreateFastifyContextOptions {
  return {
    req: {
      headers,
      log: { warn: () => {}, error: () => {} },
    },
    res: {},
  } as unknown as CreateFastifyContextOptions;
}

describe("createContext origin 판정", () => {
  it("MCP 헤더 값이 정확히 일치하면 origin은 mcp다", async () => {
    const ctx = await createContext(
      fakeOptions({ [MCP_CLIENT_HEADER_NAME]: MCP_CLIENT_HEADER_VALUE }),
    );
    expect(ctx.origin).toBe("mcp");
  });

  it("헤더가 없으면 origin은 web이다", async () => {
    const ctx = await createContext(fakeOptions({}));
    expect(ctx.origin).toBe("web");
  });

  it("헤더 값이 다르면(스푸핑 실패) origin은 web이다", async () => {
    const ctx = await createContext(
      fakeOptions({ [MCP_CLIENT_HEADER_NAME]: "not-mcp" }),
    );
    expect(ctx.origin).toBe("web");
  });
});

describe("onTRPCError 캡처 분기", () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
  });

  it("정상적인 거부(DB_NOT_FOUND)는 로그도 Sentry도 안 남긴다", () => {
    const req = fakeReq();
    const cause = new SupabaseError("not found", "PGRST116");
    onTRPCError({
      error: new TRPCError({ code: "NOT_FOUND", cause }),
      req,
    });

    expect(req.log.error).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("도메인 에러지만 예상 밖(LLM_RATE_LIMIT)이면 domainCode 태그로 캡처한다", () => {
    const req = fakeReq();
    const cause = new LlmError("rate_limit", "rate limited");
    onTRPCError({
      error: new TRPCError({ code: "TOO_MANY_REQUESTS", cause }),
      req,
    });

    expect(req.log.error).toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, {
      tags: { domainCode: "LLM_RATE_LIMIT" },
    });
  });

  it("도메인 코드가 없는 INTERNAL_SERVER_ERROR는 domainCode: UNKNOWN으로 캡처한다", () => {
    const req = fakeReq();
    const cause = new Error("LLM returned empty title");
    onTRPCError({
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
      req,
    });

    expect(req.log.error).toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, {
      tags: { domainCode: "UNKNOWN" },
    });
  });

  it("도메인 코드도 없고 INTERNAL_SERVER_ERROR도 아니면(개발자가 고른 정상 거부 코드) 안 남긴다", () => {
    const req = fakeReq();
    onTRPCError({
      error: new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      }),
      req,
    });

    expect(req.log.error).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
