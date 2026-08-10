import { describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";

import type { Evidence } from "./assemble-evidence";
import * as assembleEvidenceModule from "./assemble-evidence";
import { buildNarrationUserMessage, handleNarrationStream } from "./narration";
import type { SearchedStatement, StatementGroup } from "./statement-search";

vi.mock("./assemble-evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./assemble-evidence")>();
  return { ...actual, assembleEvidence: vi.fn() };
});

function statement(
  overrides: Partial<SearchedStatement> & { id: string },
): SearchedStatement {
  return {
    content: `내용 ${overrides.id}`,
    type: "claim",
    confidence: null,
    createdAt: "2025-01-01",
    score: 0.5,
    ...overrides,
  };
}

function group(statements: SearchedStatement[]): StatementGroup {
  return {
    key: { kind: "source", sourceId: "src", sourceCreatedAt: "2025-01-01" },
    totalStatementCount: statements.length,
    statements,
  };
}

describe("buildNarrationUserMessage", () => {
  it("진술을 dedup하고 표식·confidence를 직렬화하며 상대 진술을 따로 싣는다", () => {
    const evidence: Evidence = {
      groups: [
        group([
          statement({ id: "s1", confidence: "certain", supersededBy: ["x1"] }),
        ]),
        // s1은 두 묶음에 걸쳐 등장 — 한 번만 실려야 한다
        group([
          statement({ id: "s1", confidence: "certain", supersededBy: ["x1"] }),
          statement({ id: "s2", conflictsWith: ["s1"], resolvedBy: ["r1"] }),
        ]),
      ],
      relatedStatements: [
        {
          id: "x1",
          content: "유튜브로 바꾼다",
          type: "claim",
          createdAt: "2025-02-01",
          sourceIds: ["src-x"],
        },
      ],
    };

    const message = buildNarrationUserMessage("왜?", evidence);

    expect(message.match(/\[s:s1\]/g)).toHaveLength(1);
    expect(message).toContain("(claim, certain)");
    expect(message).toContain("superseded by s:x1");
    expect(message).toContain("conflicts with s:s1");
    expect(message).toContain("resolved by s:r1");
    expect(message).toContain("Referenced statements");
    expect(message).toContain("[s:x1] (claim) 유튜브로 바꾼다");
  });
});

describe("handleNarrationStream", () => {
  it("근거 묶음을 먼저 내보내고 산문 토큰이 뒤따른다", async () => {
    vi.mocked(assembleEvidenceModule.assembleEvidence).mockResolvedValue({
      groups: [],
      relatedStatements: [],
    });

    const providers = {
      llm: {
        forTask: vi.fn().mockReturnValue({
          generateStream: async function* () {
            yield "풀어";
            yield "읽기";
          },
        }),
      },
    } as unknown as Providers;

    const events: string[] = [];
    for await (const event of handleNarrationStream({
      supabase: {} as TypedSupabaseClient,
      providers,
      query: "왜?",
    })) {
      events.push(
        event.type === "evidence" ? "evidence" : `token:${event.text}`,
      );
    }

    expect(events).toEqual(["evidence", "token:풀어", "token:읽기"]);
  });
});
