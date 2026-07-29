import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  type Locale,
  type ReferenceListSortDirection,
  type ReferenceListSortKey,
  ReferenceListSortKeySchema,
  type ReferenceListStatusFilter,
} from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";
import { composeRevertTitle } from "@server/services/changeset-service";

type ReferenceType = Database["public"]["Enums"]["reference_type"];
type ReferenceStatus = Database["public"]["Enums"]["reference_status"];

interface ReferenceSummary {
  id: string;
  type: ReferenceType;
  title: string;
  status: ReferenceStatus;
  createdAt: string;
}

const REFERENCE_LIST_SORT_COLUMN = {
  title: "title",
  createdAt: "created_at",
} as const;

// ILIKE는 기본으로 `\`를 이스케이프 문자로 쓴다(Postgres 기본값) — 검색어에
// 든 %·_·\ 를 와일드카드가 아니라 글자 그대로 매칭하려면 먼저 이스케이프해야
// 한다(기존 클라이언트 .includes()는 와일드카드 개념이 없었다).
function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// PostgREST의 or()/and() 필터 문법은 콤마·괄호·점을 구분자로 쓴다 — 정렬값이
// 임의 텍스트(title)라 그 문자들을 포함할 수 있어(예: "OpenAI, Inc."),
// 큰따옴표로 감싸 리터럴로 취급시킨다.
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// sortKey를 커서 안에 같이 실어서, title 기준으로 발급된 커서를 createdAt
// 정렬로(또는 그 반대로) 잘못 재사용하면 값 타입이 안 맞기 전에 sortKey
// 불일치로 먼저 걸러진다. id는 uuid로 검증한다 — 그러지 않으면 이 값이
// or() 필터에 그대로 꽂혀 Postgres가 22P02(invalid uuid)를 던지는데,
// toSupabaseErrorCode가 이 코드를 모르니 BAD_REQUEST가 아니라 예상치
// 못한 500(query_failed)으로 새 나간다.
const ReferenceCursorPayloadSchema = z.tuple([
  ReferenceListSortKeySchema,
  z.string(),
  z.string().uuid(),
]);

function encodeReferenceCursor(args: {
  sortKey: ReferenceListSortKey;
  sortValue: string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify([args.sortKey, args.sortValue, args.id]),
  ).toString("base64url");
}

function decodeReferenceCursor(
  cursor: string,
  sortKey: ReferenceListSortKey,
): {
  sortValue: string;
  id: string;
} {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString(),
    );
    const [cursorSortKey, sortValue, id] =
      ReferenceCursorPayloadSchema.parse(parsed);
    if (cursorSortKey !== sortKey) {
      throw new Error("cursor was issued for a different sortKey");
    }
    return { sortValue, id };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }
}

// 내 Workspace의 Reference 목록(trashed는 항상 제외) — 격리는 RLS(Workspace
// 멤버십)가 담당한다. search·type·status·정렬·커서를 전부 서버에서 처리한다 —
// 사전·위키 찾아보기 목적이라 클라이언트가 로드한 페이지 안에서만 걸러지는
// 필터로는 전체를 찾을 수 없었다(surface-inventory.md "Reference 목록").
export async function listReferences(args: {
  supabase: TypedSupabaseClient;
  search?: string;
  type?: ReferenceType;
  status?: ReferenceListStatusFilter;
  sortKey: ReferenceListSortKey;
  sortDirection: ReferenceListSortDirection;
  limit: number;
  cursor?: string;
}): Promise<{ references: ReferenceSummary[]; nextCursor: string | null }> {
  const {
    supabase,
    search,
    type,
    status,
    sortKey,
    sortDirection,
    limit,
    cursor,
  } = args;
  const sortColumn = REFERENCE_LIST_SORT_COLUMN[sortKey];
  const ascending = sortDirection === "asc";

  let query = supabase
    .from("references")
    .select("id, type, title, status, created_at")
    .neq("status", "trashed")
    .order(sortColumn, { ascending })
    .order("id", { ascending })
    // 다음 페이지 존재 여부를 별도 count 쿼리 없이 알려고 하나 더 얹어 받는다.
    .limit(limit + 1);

  if (type) {
    query = query.eq("type", type);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.ilike("title", `%${escapeIlikePattern(search)}%`);
  }
  if (cursor) {
    const decoded = decodeReferenceCursor(cursor, sortKey);
    const op = ascending ? "gt" : "lt";
    const quotedValue = quoteFilterValue(decoded.sortValue);
    query = query.or(
      `${sortColumn}.${op}.${quotedValue},and(${sortColumn}.eq.${quotedValue},id.${op}.${decoded.id})`,
    );
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? encodeReferenceCursor({
          sortKey,
          sortValue: sortKey === "title" ? lastRow.title : lastRow.created_at,
          id: lastRow.id,
        })
      : null;

  return {
    references: pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
    })),
    nextCursor,
  };
}

interface ReferenceTagRef {
  id: string;
  title: string;
}

interface ReferenceDetail {
  id: string;
  type: ReferenceType;
  title: string;
  body: string;
  status: ReferenceStatus;
  externalUrls: string[];
  tags: ReferenceTagRef[];
  createdAt: string;
  updatedAt: string;
}

// Reference 상세 단건 조회 — 격리는 RLS(references_member_select)가 담당한다.
// externalUrls는 update_reference의 "전체 상태 diff" 계약(RPC 주석 참고) 때문에
// 편집 폼이 그대로 들고 있다가 되돌려 보내야 해서 필수로 포함한다. tags는 별도
// 쿼리(reference_tags 조인)로 붙인다 — reference_tags(tags(...)) 2단 중첩 임베드
// 대신 changeset-service.ts의 changes(target_type, data) 패턴처럼 1단 임베드만
// 쓰는 게 이 코드베이스의 기존 관례다.
export async function getReference(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
}): Promise<ReferenceDetail> {
  const { supabase, referenceId } = args;

  const [referenceResult, tagResult] = await Promise.all([
    supabase
      .from("references")
      .select(
        "id, type, title, body, status, external_urls, created_at, updated_at",
      )
      .eq("id", referenceId)
      .single(),
    supabase
      .from("reference_tags")
      .select("tags(id, title)")
      .eq("reference_id", referenceId),
  ]);
  throwIfSupabaseError(referenceResult.error);
  throwIfSupabaseError(tagResult.error);

  const reference = referenceResult.data;

  return {
    id: reference.id,
    type: reference.type,
    title: reference.title,
    body: reference.body,
    status: reference.status,
    externalUrls: reference.external_urls ?? [],
    tags: (tagResult.data ?? []).flatMap((row) =>
      row.tags ? [{ id: row.tags.id, title: row.tags.title }] : [],
    ),
    createdAt: reference.created_at,
    updatedAt: reference.updated_at,
  };
}

// Reference 직접 수정 — update_reference RPC가 전체 상태를 받아 필드별 diff·
// manual changeset 기록을 전부 담당한다(RPC 주석 참고). 서버는 호출만.
export async function updateReference(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
  type: ReferenceType;
  title: string;
  body: string;
  externalUrls: string[];
}): Promise<void> {
  const { supabase, referenceId, type, title, body, externalUrls } = args;

  const { error } = await supabase.rpc("update_reference", {
    p_reference_id: referenceId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_external_urls: externalUrls,
  });
  throwIfSupabaseError(error);
}

// Reference 아카이브 — archive_reference RPC가 active→archived 전이 + manual
// changeset 기록을 전부 담당한다. 인용은 끊기지 않는다(RPC 주석 참고).
export async function archiveReference(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("archive_reference", {
    p_reference_id: args.referenceId,
  });
  throwIfSupabaseError(error);
}

// 아카이브 되살리기 — 이 Reference를 마지막으로 archive한 changeset을
// revert_changeset으로 되돌린다(review-flow.md "아카이브 되살리기").
export async function restoreReference(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
  lng: Locale;
}): Promise<void> {
  const { supabase, referenceId, lng } = args;

  const { data: target, error: lookupError } = await supabase
    .rpc("find_manual_archive_changeset", {
      p_target_type: "reference",
      p_target_id: referenceId,
    })
    .maybeSingle();
  throwIfSupabaseError(lookupError);
  if (!target) {
    throw new SupabaseError(
      "reference_state_changed",
      `reference ${referenceId} has no archiving changeset to restore`,
    );
  }

  const title = composeRevertTitle({
    originalTitle: target.title,
    originalNumber: target.number,
    lng,
  });

  const { error } = await supabase.rpc("restore_reference", {
    p_reference_id: referenceId,
    p_title: title,
  });
  throwIfSupabaseError(error);
}

// Reference에 기존 Tag 연결 — link_reference_tag RPC가 양쪽 active·멤버십
// 검사와 멱등 삽입을 담당한다.
export async function addReferenceTag(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
  tagId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("link_reference_tag", {
    p_reference_id: args.referenceId,
    p_tag_id: args.tagId,
  });
  throwIfSupabaseError(error);
}

// Reference에서 Tag 떼기 — unlink_reference_tag RPC가 멱등 삭제를 담당한다.
export async function removeReferenceTag(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
  tagId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("unlink_reference_tag", {
    p_reference_id: args.referenceId,
    p_tag_id: args.tagId,
  });
  throwIfSupabaseError(error);
}

interface CitingDigest {
  id: string;
  title: string;
}

// 이 Reference를 인용하는(활성) Digest 목록 — 삭제 확인 UI가 "인용 있음/없음"을 가르는
// 재료이자 Reference 상세 화면의 역참조 표시 재료(statement_references의 문장 단위
// 정밀 인용과는 다른 층위 — Digest 단위 인용, 20260706115232 주석 참고). digest_references의
// SELECT RLS는 citing Digest가 속한 Space 멤버십으로 격리하는데 Reference는 Workspace
// 스코프라, 그 Space에 속하지 않은 워크스페이스 멤버는 실제 인용이 direct select에서
// 조용히 빠진다 — 삭제 확인이 "인용 없음"으로 잘못 판정할 수 있는 안전 문제라 RPC로
// Space 경계를 넘어 워크스페이스 멤버십만으로 조회한다.
export async function getReferenceCitingDigests(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
}): Promise<{ digests: CitingDigest[] }> {
  const { supabase, referenceId } = args;

  const { data, error } = await supabase.rpc("get_reference_citing_digests", {
    p_reference_id: referenceId,
  });
  throwIfSupabaseError(error);

  return {
    digests: (data ?? []).map((row) => ({
      id: row.digest_id,
      title: row.digest_title,
    })),
  };
}

// Reference 삭제 — 즉시 trashed 전환(검색·멘션 추천 등 모든 표면에서 즉시 제외),
// 30일 뒤 purge_expired_references 배치가 완전 삭제한다. 인용 있음/없음에 따른
// 확인 분기(가벼운 확인 vs 이름 타이핑 확인)는 화면 몫 — 서버는 전이 하나만 담당.
export async function trashReference(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
}): Promise<void> {
  const { supabase, referenceId } = args;

  const { error } = await supabase.rpc("trash_reference", {
    p_reference_id: referenceId,
  });
  throwIfSupabaseError(error);
}
