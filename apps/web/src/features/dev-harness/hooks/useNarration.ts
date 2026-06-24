import { useState } from "react";
import { skipToken } from "@tanstack/react-query";

import type { NarrationEvidence } from "@web/features/dev-harness/types";
import { trpc } from "@web/lib/trpc";

// 해설 구독은 근거(evidence)를 먼저 통째로 흘리고, 이어 산문 토큰을 잇는다 (narration-design 7장).
// 둘을 한 구독에서 받아 근거 위에 산문을 쌓는다. query가 바뀌면 onStarted가 상태를 비운다.
export function useNarration(query: string) {
  const [evidence, setEvidence] = useState<NarrationEvidence | null>(null);
  const [prose, setProse] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 작성자 존을 실어 시간 질의("이번 주 마감")를 이 존 기준으로 풀게 한다.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  trpc.narration.narrate.useSubscription(
    query ? { query, timeZone } : skipToken,
    {
      onStarted() {
        setEvidence(null);
        setProse("");
        setError(null);
      },
      onData(event) {
        if (event.type === "evidence") {
          setEvidence(event.evidence);
        } else {
          setProse((prev) => prev + event.text);
        }
      },
      onError(err) {
        setError(err.message);
      },
    },
  );

  return { evidence, prose, error, active: query.length > 0 };
}
