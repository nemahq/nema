import { useEffect } from "react";

import { supabase } from "@web/lib/supabase";
import { trpc } from "@web/lib/trpc";

const CHANNEL_NAME = "realtime-invalidation";

// Supabase Realtime(Postgres CDC)로 비동기 작업 완료를 폴링 없이 반영한다.
// 설계: payload를 캐시에 직접 patch하지 않고 "바뀌었다" 신호로만 써서 해당 쿼리를
// invalidate한다 — 서버 응답 shape에 안 묶여 견고하고, RLS 필터를 포함한 기존 조회
// 로직을 그대로 재사용한다. RLS가 브로드캐스트를 구독자 Space로 스코프하지만, 설령
// 범위 밖 이벤트가 새더라도 invalidate는 자기 데이터를 다시 읽을 뿐이라 유출이 없다.
export function useRealtimeInvalidation() {
  // useUtils()는 Provider context 기반 memo라 참조가 안정적 — deps에 넣어도
  // effect는 마운트 시 한 번만 돌아 채널을 앱 세션당 하나로 유지한다.
  const utils = trpc.useUtils();

  useEffect(
    function subscribeRealtimeInvalidation() {
      function invalidatePendingSources() {
        void utils.source.listPending.invalidate();
      }
      function invalidateChangesetBadges() {
        void utils.space.list.invalidate();
        void utils.changeset.listChangesets.invalidate();
      }

      const channel = supabase
        .channel(CHANNEL_NAME)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sources" },
          invalidatePendingSources,
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "changesets" },
          invalidateChangesetBadges,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "changesets" },
          invalidateChangesetBadges,
        )
        .subscribe();

      return function unsubscribe() {
        void supabase.removeChannel(channel);
      };
    },
    [utils],
  );
}
