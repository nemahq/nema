import * as Sentry from "@sentry/node";
import type { User } from "@supabase/supabase-js";

import type { BootstrapUser, WorkspaceBootstrap } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// apps/web/src/lib/auth의 AppUser 표시 이름 도출과 같은 우선순위(구글은 given_name/
// full_name을 채우고, 매직링크는 이메일만 있음) — 서버가 이 값을 계약으로 내려주므로
// FE·MCP 등 다른 소비자도 이름 도출 로직을 각자 다시 구현하지 않아도 된다.
const NAME_PRIORITY: Array<(u: User) => unknown> = [
  (u) => u.user_metadata?.["given_name"],
  (u) => u.user_metadata?.["full_name"],
  (u) => u.email,
];

export function toBootstrapUser(user: User): BootstrapUser {
  let name = "";
  for (const resolve of NAME_PRIORITY) {
    const resolved = resolve(user);
    if (typeof resolved === "string" && resolved) {
      name = resolved;
      break;
    }
  }

  // 지금 로그인 방식(Google/매직링크)에서는 given_name/full_name/email 중
  // 하나는 항상 있어 실제로는 도달하지 않지만, UI가 이제 이 이름을 그대로
  // 노출하므로 raw UUID가 조용히 새 나가지 않게 신호는 남겨둔다.
  if (!name) {
    Sentry.captureMessage(
      "toBootstrapUser: 이름 후보 3개 모두 실패, id로 대체",
      {
        level: "warning",
        tags: {
          component: "workspace-service",
          outcome: "name-fallback-to-id",
        },
        extra: { userId: user.id },
      },
    );
  }

  const rawAvatar = user.user_metadata?.["avatar_url"];

  return {
    id: user.id,
    name: name || user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(typeof rawAvatar === "string" && rawAvatar
      ? { avatarUrl: rawAvatar }
      : {}),
  };
}

// 신규 유저 랜딩 진입점. MVP는 워크스페이스 단수 전제라 가장 오래된 멤버십(=가입
// 트리거가 만든 것) 하나만 본다 — source-service의 "가장 오래된 Space = 개인 칸"과
// 같은 판단. Space는 가입 트리거가 이미 만들어두므로 여기서 만들지 않고, 대신
// mark_first_entry()로 "이 유저의 첫 진입"만 원자적으로 표시해 라우팅 신호로 쓴다.
export async function bootstrapWorkspace(args: {
  supabase: TypedSupabaseClient;
  user: User;
}): Promise<WorkspaceBootstrap> {
  const { supabase, user } = args;
  const bootstrapUser = toBootstrapUser(user);

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name)")
    .order("created_at", { ascending: true })
    .limit(1);
  throwIfSupabaseError(membershipError);

  // 가입 트리거가 항상 워크스페이스 멤버십을 만들어두므로 0건은 정상 케이스가
  // 아니라 그 불변식이 깨졌다는 뜻(트리거 실패·마이그레이션 문제 등) — SupabaseError가
  // 아닌 일반 Error로 던져 EXPECTED_DOMAIN_CODES(정상 거부로 취급해 Sentry 캡처를
  // 건너뜀)에 안 걸리고 확실히 알림이 가게 한다.
  const membership = memberships?.[0];
  if (!membership) {
    throw new Error(
      `User ${user.id} has no workspace membership — signup trigger invariant broken`,
    );
  }

  // 첫 진입 표식은 그 자체로 커밋되는 별도 RPC라 마지막에 소비한다 — 앞의 조회가
  // 실패하면 응답이 아예 안 나가는데, 표식을 먼저 태우면 그 신호가 이 요청과 함께
  // 영영 사라진다(재시도해도 이미 false).
  const { data: isFirstEntry, error: firstEntryError } =
    await supabase.rpc("mark_first_entry");
  throwIfSupabaseError(firstEntryError);

  return {
    user: bootstrapUser,
    workspace: {
      id: membership.workspaces.id,
      // 이름을 아직 안 지은 워크스페이스는 유저 이름을 값 그대로 쓴다("~의 워크스페이스"
      // 같은 조합 없이) — 이름 정책 자체는 여전히 미정(07-modeling.md "열어두는 것").
      name: membership.workspaces.name ?? bootstrapUser.name,
    },
    isFirstEntry: Boolean(isFirstEntry),
  };
}
