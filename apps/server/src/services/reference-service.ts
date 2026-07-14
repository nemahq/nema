import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

type ReferenceType = Database["public"]["Enums"]["reference_type"];

const REFERENCE_LIST_LIMIT = 100;

interface ReferenceSummary {
  id: string;
  type: ReferenceType;
  title: string;
  createdAt: string;
}

// 내 Workspace의 Reference 목록(trashed 제외) — 격리는 RLS(Workspace 멤버십)가 담당한다.
export async function listReferences(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ references: ReferenceSummary[] }> {
  const { supabase } = args;

  const { data, error } = await supabase
    .from("references")
    .select("id, type, title, created_at")
    .neq("status", "trashed")
    .order("created_at", { ascending: false })
    .limit(REFERENCE_LIST_LIMIT);
  throwIfSupabaseError(error);

  return {
    references: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      createdAt: row.created_at,
    })),
  };
}

interface CitingDigest {
  id: string;
  title: string;
}

// 이 Reference를 인용하는(활성) Digest 목록 — 삭제 확인 UI가 "인용 있음/없음"을 가르는
// 재료이자 Reference 상세 화면의 역참조 표시 재료(statement_references의 문장 단위
// 정밀 인용과는 다른 층위 — Digest 단위 인용, 20260706115232 주석 참고). digest_references
// SELECT RLS가 이미 Space 멤버십으로 격리하므로 RPC 없이 direct select로 충분하다.
export async function getReferenceCitingDigests(args: {
  supabase: TypedSupabaseClient;
  referenceId: string;
}): Promise<{ digests: CitingDigest[] }> {
  const { supabase, referenceId } = args;

  const { data, error } = await supabase
    .from("digest_references")
    .select("digests!inner(id, title)")
    .eq("reference_id", referenceId)
    .eq("digests.status", "active");
  throwIfSupabaseError(error);

  return {
    digests: (data ?? []).map((row) => ({
      id: row.digests.id,
      title: row.digests.title,
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
