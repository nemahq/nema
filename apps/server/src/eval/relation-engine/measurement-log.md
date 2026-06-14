# 관계 엔진 측정 일지

> 관계 판정(③ 잇기) 평가의 라운드별 기록 — 무엇을 바꿨고, 숫자가 어떻게 움직였고, 무엇을 발견했나.
> 평가 방식은 [relation-design §5](../../../../../docs/flows/save-engine-v2/relation-design.md), raw 결과(실패 사례 전수)는 같은 폴더의 `results-judgment-*.json`(gitignore, 재실행으로 재생성).
> 측정 대상 = 제품과 동일한 판정 1콜(`prompts/relation-judgment.ts` + gpt-5 standard, `LINKING_REASONING_EFFORT`/`LINKING_TIMEOUT_MS` 미러) + 동일한 게이트(`gateProposals`). 채점은 LLM 심판이 아니라 코드 정확 비교(라벨→골든 id가 통제돼 있어 해석 불필요).

---

## 측정 #1 — 2026-06-14 · 평가셋 첫 가동 + supports 조이기 (NEM-131 첫 슬라이스)

**바꾼 것**: 관계 판정 평가셋 신설(시나리오 10개 = 4종 양성 + 함정 4종[지어낸 supports·헛 충돌·경합→교대 오판·무관계]) + `prompts/relation-judgment.ts`의 supports 절 조이기. 측정은 `--runs 8`(시나리오당 8회, 총 80회)로 드문 FP를 안정적으로 잡았다.

**전후** (supports, 80회 micro):

| 프롬프트 | supports precision | supports recall | supports FP | 비고 |
|---|---|---|---|---|
| baseline (`cfc6413e`) | 0.941 | 1.0 | 2 | FP = 전부 "가격 확정 → 가격표 할일" |
| 조이기 v1 (`016fe7d8`) | 1.0 | **0.75** | 0 | **과조임 — 진짜 supports 8건 죽임, 폐기** |
| 조이기 최종 (`6dea9f9b`) | **1.0** | **1.0** | **0** | 2회 연속 재현(80회×2) |

- **헤드라인**: 지어낸 supports FP **2 → 0**, 진짜 supports 손실 없음(recall 1.0 유지). 게이트 통과(applied) supports FP는 전 구간 0 — 조용히 박힌 가짜 근거는 baseline에도 없었다.

**발견 1 — 조임의 축은 "연결어"가 아니라 "근거인가"다.** v1은 "본문에 because/이유는 같은 명시 연결어가 있을 때만 supports"로 조였더니, 근거와 결정이 *다른 진술*에 떨어져 연결어가 없는 정당한 supports(예: "토스가 출시 빠르다" → "토스로 한다")를 8/8 전부 놓쳤다(recall 0.75). 최종본은 "`from`이 `to`의 *근거*로서 논거가 되는가"로 바꿔 — 연결어 없이 떨어져 있어도 인정 — recall을 되살리며 FP만 제거했다.

**발견 2 — 살아남은 FP는 전부 supports→todo였다.** baseline·v2에서 끈질긴 단 하나의 supports FP는 "가격 확정(claim) → 가격표 넣기(**todo**)"였다. 근거는 *주장(claim)*을 받치는 것이고 할 일·질문은 `resolves`로 닫히지 supports로 받쳐지지 않는다(§5: 근거→결정). "`to`는 claim이어야 한다 — task·question은 supports 금지" 규칙을 더하자 이 FP가 사라졌다(시드의 진짜 supports 4건은 모두 claim을 향해 recall 무손실).

**범위 밖(관측만)**: conflicts FP가 80회당 1~4건 출렁였다 — ① 도그푸딩 시나리오의 수수료 단점(e1)을 전환 결정과 "충돌"로 과발화, ② 리디자인↔이탈 인접성을 충돌로 오판. 전부 게이트 pending(사람이 거름)이라 supports applied FP만큼 해롭지 않고, 이번 슬라이스(supports 1순위)의 경계 밖이다. conflicts 조이기는 후속 거리.

**한계**: 시드는 손으로 짠 10 시나리오라 골든이 닫힌 세계다 — 엔진이 골든 밖 "진짜" 관계를 내면 FP로 깎인다. 실패 사례를 원문째 남겨(`results-judgment-*.json`) 사람이 검토·보정하는 루프 전제(eval-design 결정 #6·#7). brain 이주(첫 대량 도그푸딩) 때 시드가 실데이터로 자란다(relation-design §11).
