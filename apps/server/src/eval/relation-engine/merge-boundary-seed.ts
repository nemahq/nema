// "같음(merge)" 경계 측정용 씨앗 — NEM-162.
// 합치기 기능을 본격 구현(shared enum·DB·워커)하기 전, 선결 de-risk: 판정 모델이
// "엄격한 같음"(순수 재진술, 새 정보 없음)을 약한 뒷받침·확신 progression·대체·충돌과
// 깔끔히 가르는지부터 잰다. 못 가르면 합치기 자체가 흔들리므로 싸게 먼저 본다.
//
// mergeable=true = 진짜 같은 말(합쳐야). false = 같지 않음(합치면 과합치 = 위험한 오류).
// 핵심 지표는 "같음" 판정의 정밀도(precision) — 다른 걸 같다고 하면 알갱이가 뭉개진다.

export interface BoundaryStatement {
  content: string;
  type: "claim" | "question" | "todo";
  confidence: "certain" | "guess" | null;
}

interface MergeBoundaryPair {
  id: string;
  a: BoundaryStatement;
  b: BoundaryStatement;
  /** 진짜 같은 말인가 (합쳐야 하는가) */
  mergeable: boolean;
  /** mergeable=false일 때 진짜 관계는 무엇인가 (혼동 분석용) */
  trueRelation: "supports" | "replaces" | "conflicts" | "resolves" | "none";
  note: string;
}

const claim = (
  content: string,
  confidence: "certain" | "guess",
): BoundaryStatement => ({ content, type: "claim", confidence });

export const MERGE_BOUNDARY_PAIRS: MergeBoundaryPair[] = [
  // ----- 진짜 같은 말 (합쳐야) -----
  {
    id: "same-verbatim",
    a: claim("회원가입 전환율은 약 12퍼센트다", "certain"),
    b: claim("회원가입 전환율은 약 12퍼센트다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "완전 동일 문자열 재투입 — 가장 명백한 같음",
  },
  {
    id: "same-paraphrase-num",
    a: claim("가입 전환율이 12퍼센트 정도로 나온다", "certain"),
    b: claim("회원가입 전환율은 약 12퍼센트다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "같은 수치·사실, 표현만 다름",
  },
  {
    id: "same-reingest-decision",
    a: claim("결제 연동은 토스페이먼츠로 가기로 했다", "certain"),
    b: claim("결제는 토스페이먼츠로 하기로 정했다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "같은 결정의 재진술 (말만 다름)",
  },
  {
    id: "same-job-change",
    a: claim("팀을 옮겼다", "certain"),
    b: claim("이직했다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "faq.md 예시 — 어휘는 다르나 같은 사실",
  },
  {
    id: "same-deadline",
    a: claim("마감을 금요일로 정했다", "certain"),
    b: claim("마감일은 금요일이다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "같은 사실, 동사형만 다름",
  },
  {
    id: "same-reorder",
    a: claim("검증 대상을 N잡 수익 관리로 확정했다", "certain"),
    b: claim("검증 대상은 N잡 수익 관리로 정했다", "certain"),
    mergeable: true,
    trueRelation: "none",
    note: "어순·서술만 다른 같은 확정",
  },

  // ----- 같지 않음 (합치면 안 됨) -----
  {
    id: "notsame-progression",
    a: claim("남은 후보 중에서는 N잡 수익 관리가 가장 앞선다고 본다", "guess"),
    b: claim("검증 대상을 N잡 수익 관리로 확정했다", "certain"),
    mergeable: false,
    trueRelation: "none",
    note: "확신 progression(guess→certain) — 같은 방향이나 '생각이 굳은 이력'이라 합치면 정보 손실. 같음 아님",
  },
  {
    id: "notsame-supports",
    a: claim(
      "N잡은 정산 데이터를 매달 보내는 행동이 습관으로 자리잡는다",
      "certain",
    ),
    b: claim("N잡은 B2C인데도 해볼 만하다", "guess"),
    mergeable: false,
    trueRelation: "supports",
    note: "한쪽이 다른 쪽의 근거 — 내용이 다르다. 뒷받침이지 같음 아님",
  },
  {
    id: "notsame-elaboration",
    a: claim("N잡 수익 관리를 후보로 본다", "guess"),
    b: claim(
      "N잡 수익 관리는 매달 반복되는 일이라 습관이 붙기 쉬워 보인다",
      "guess",
    ),
    mergeable: false,
    trueRelation: "supports",
    note: "한쪽이 살을 붙여 이유를 댐 — 새 정보가 있으므로 같음 아님 (과합치 함정)",
  },
  {
    id: "notsame-replaces",
    a: claim("1인가구 생활관리를 후보로 본다", "guess"),
    b: claim("1인가구 생활관리는 접기로 했다", "certain"),
    mergeable: false,
    trueRelation: "replaces",
    note: "번복·교대 — 후보였다가 접음. 대체지 같음 아님",
  },
  {
    id: "notsame-conflict",
    a: claim("1인가구 시장에는 뚜렷한 강자가 보이지 않는다", "guess"),
    b: claim("1인가구 시장은 두잇이 자금과 팀으로 선점했다", "certain"),
    mergeable: false,
    trueRelation: "conflicts",
    note: "같은 사실을 두고 어긋남 — 충돌이지 같음 아님",
  },
  {
    id: "notsame-topic-only",
    a: claim("검색 속도 개선을 다음 스프린트 1순위로 둔다", "certain"),
    b: claim("검색 인덱싱은 야간 배치로 돈다", "certain"),
    mergeable: false,
    trueRelation: "none",
    note: "'검색' 토픽만 겹침 — 무관. 같음 아님",
  },
];
