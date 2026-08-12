import type { DigestListEntry, Statement } from "@nema-io/shared";
import { DigestSchema, StatementSchema } from "@nema-io/shared";

import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";

const DIGEST_COLUMNS = "id, source_id, type, title, body, created_at" as const;
const STATEMENT_COLUMNS =
  "id, digest_id, digest_field, content, created_at" as const;

export async function listDigests(args: {
  supabase: TypedSupabaseClient;
}): Promise<DigestListEntry[]> {
  const { supabase } = args;

  const { data: rows, error } = await supabase
    .from("digests")
    .select(DIGEST_COLUMNS)
    .order("created_at", { ascending: false });
  throwIfSupabaseError(error);

  return attachStatements({ supabase, rows: rows ?? [] });
}

export async function getDigest(args: {
  supabase: TypedSupabaseClient;
  digestId: string;
}): Promise<DigestListEntry> {
  const { supabase, digestId } = args;

  // RLS(owner-only, sources 조인)라 남의/없는 digestId는 여기서 not-found로 걸린다.
  const { data: row, error } = await supabase
    .from("digests")
    .select(DIGEST_COLUMNS)
    .eq("id", digestId)
    .single();
  throwIfSupabaseError(error);

  const [entry] = await attachStatements({ supabase, rows: [row] });
  return entry;
}

async function attachStatements(args: {
  supabase: TypedSupabaseClient;
  rows: DigestRow[];
}): Promise<DigestListEntry[]> {
  const { supabase, rows } = args;
  if (rows.length === 0) {
    return [];
  }

  const { data: statementRows, error } = await supabase
    .from("statements")
    .select(STATEMENT_COLUMNS)
    .in(
      "digest_id",
      rows.map((row) => row.id),
    );
  throwIfSupabaseError(error);

  const statementByDigestId = new Map(
    (statementRows ?? []).map((row) => [row.digest_id, toStatement(row)]),
  );

  return rows.map((row) =>
    toDigestListEntry(row, statementByDigestId.get(row.id) ?? null),
  );
}

type DigestRow = Pick<
  Database["public"]["Tables"]["digests"]["Row"],
  "id" | "source_id" | "type" | "title" | "body" | "created_at"
>;

type StatementRow = Pick<
  Database["public"]["Tables"]["statements"]["Row"],
  "id" | "digest_id" | "digest_field" | "content" | "created_at"
>;

// DB round-trip 결과를 판별 유니언으로 단언하지 않고 실제로 검증한다 —
// source-service.ts의 toDigest·statement-service.ts의 toStatement와 같은 근거
// (DB→API 응답 경계의 방어선).
function toDigestListEntry(
  row: DigestRow,
  statement: Statement | null,
): DigestListEntry {
  const digest = DigestSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  });
  return { ...digest, sourceId: row.source_id, statement };
}

function toStatement(row: StatementRow): Statement {
  return StatementSchema.parse({
    id: row.id,
    digestId: row.digest_id,
    digestField: row.digest_field,
    content: row.content,
    createdAt: row.created_at,
  });
}
