import { describe, expect, it } from "vitest";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import {
  MCP_CLIENT_HEADER_NAME,
  MCP_CLIENT_HEADER_VALUE,
} from "@nema-io/shared";

import { createContext } from "@server/trpc";

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
