// eval B 시험지 (auto-scoping-design §6 B) — scope 검색이 전역 대비 recall을 지키나.
//
// 질의는 주제당 1개, 주제 이름·정답 어휘를 피한 "묻힌" 스타일이다 — 전역 검색이 쉬우면
// scope 이득이 안 드러나므로 일부러 어렵게 짠다. gold = 정답 주제(tiro thread).
// 정답 진술은 박지 않는다(근사): 그 주제 노트들에서 추출된 진술 전부를 정답으로 본다.
// COARSE_QUERIES(측정 #17)를 못 쓰는 이유 — 그 질의의 디테일이 실제 gold 주제 노트에
// 실재하는지 검증된 적이 없다(coarse는 노트를 안 보고 질의 텍스트만 본다). eval B는 정답이
// 코퍼스에 실재해야 하므로, 노트 내용을 직접 읽어 답이 그 주제에 사는 질의만 새로 짠다.

import type { CoarseQuery } from "./coarse-scoping-seed";

export const SCOPED_QUERIES: CoarseQuery[] = [
  {
    id: "s1",
    band: "buried",
    gold: ["suggest"],
    text: "갭이랑 토픽 주간 배치로 모아 보여주는 기능, 한 달 운영비 얼마로 추산했지?",
  },
  {
    id: "s2",
    band: "buried",
    gold: ["module_fed"],
    text: "프론트 빌드 충돌 줄이려고 호스트랑 피처 레포로 쪼개 런타임에 끼우기로 한 거, 릴리즈 목표가 언제였어?",
  },
  {
    id: "s3",
    band: "buried",
    gold: ["phone_monitor"],
    text: "대기 시간을 짧은 구간으로 끊어 상담사 성과 보자던 고객 인터뷰?",
  },
  {
    id: "s4",
    band: "buried",
    gold: ["connect"],
    text: "상담 채팅을 채널에서 떼어 독립 객체로 두고 채널끼리 공유하자던 킥오프 설계?",
  },
  {
    id: "s5",
    band: "buried",
    gold: ["ai_mkt_engine"],
    text: "리드 자동수집 PoC에서 미팅 자동잡기는 빼고 대시보드랑 알림부터 가자던 단계 계획?",
  },
  {
    id: "s6",
    band: "buried",
    gold: ["post_eval"],
    text: "상담을 만족도랑 정확성 두 축 네 칸 매트릭스로 보자던 평가 회의?",
  },
];
