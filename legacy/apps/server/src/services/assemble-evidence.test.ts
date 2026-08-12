import { describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";

import { assembleEvidence } from "./assemble-evidence";
import type { SearchedStatement, StatementGroup } from "./statement-search";
import * as statementSearch from "./statement-search";

vi.mock("./statement-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./statement-search")>();
  return { ...actual, searchStatements: vi.fn() };
});

function group(statements: SearchedStatement[]): StatementGroup {
  return {
    key: {
      kind: "source",
      sourceId: "src-found",
      sourceCreatedAt: "2025-01-01",
    },
    totalStatementCount: statements.length,
    statements,
  };
}

function statement(
  overrides: Partial<SearchedStatement> & { id: string },
): SearchedStatement {
  return {
    content: "내용",
    type: "claim",
    confidence: null,
    createdAt: "2025-01-01",
    score: 0.5,
    ...overrides,
  };
}

// statements 원장 조회만 stub — searchStatements는 모듈 mock으로 대체된다.
function supabaseReturning(rows: unknown[]) {
  const inMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ in: inMock }),
  });
  return {
    client: { from: fromMock } as unknown as TypedSupabaseClient,
    fromMock,
    inMock,
  };
}

const noopProviders = {} as Providers;

describe("assembleEvidence 근거 채우기", () => {
  it("표식 상대 본문을 채우되 이미 결과에 있는 진술은 다시 채우지 않는다", async () => {
    vi.mocked(statementSearch.searchStatements).mockResolvedValue({
      groups: [
        group([
          statement({ id: "s1", supersededBy: ["s2"] }),
          // s3의 충돌 상대 s1은 이미 결과에 있으니 상대 채우기에서 빠져야 한다
          statement({ id: "s3", conflictsWith: ["s1"] }),
        ]),
      ],
    });

    const { client, inMock } = supabaseReturning([
      {
        id: "s2",
        content: "유튜브로 바꾼다",
        type: "claim",
        created_at: "2025-02-01",
        statement_sources: [{ source_id: "src-2" }],
      },
    ]);

    const evidence = await assembleEvidence({
      supabase: client,
      providers: noopProviders,
      query: "왜 뒤집었지?",
    });

    expect(inMock).toHaveBeenCalledWith("id", ["s2"]);
    expect(evidence.relatedStatements).toEqual([
      {
        id: "s2",
        content: "유튜브로 바꾼다",
        type: "claim",
        createdAt: "2025-02-01",
        sourceIds: ["src-2"],
      },
    ]);
  });

  it("표식이 없으면 상대 진술을 조회하지 않는다", async () => {
    vi.mocked(statementSearch.searchStatements).mockResolvedValue({
      groups: [group([statement({ id: "s1" })])],
    });

    const { client, fromMock } = supabaseReturning([]);

    const evidence = await assembleEvidence({
      supabase: client,
      providers: noopProviders,
      query: "q",
    });

    expect(evidence.relatedStatements).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("timeZone을 searchStatements로 흘린다 — 해설 경로 시간 질의가 시간 경로를 타게", async () => {
    vi.mocked(statementSearch.searchStatements).mockResolvedValue({
      groups: [],
    });
    const { client } = supabaseReturning([]);

    await assembleEvidence({
      supabase: client,
      providers: noopProviders,
      query: "이번 주 마감",
      timeZone: "Asia/Seoul",
    });

    expect(statementSearch.searchStatements).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: "Asia/Seoul" }),
    );
  });
});
