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

---

## 측정 #2 — 2026-06-15 · conflicts 조이기 (NEM-131 후속 슬라이스)

**바꾼 것**: 측정 #1의 범위 밖 관측(수수료 단점→충돌 과발화)을 본 작업으로 조였다. `prompts/relation-judgment.ts`에 "Conflicts — a contradiction, not a caveat" 절 신설(동시-참 테스트·의미 판단[부정어 불요]·끝점 규칙) + caveat을 `conflicts:false`로 가르치던 기존 예시 수정. 시드에 conflicts 함정 3종 추가(caveat·질문 재유입·바꿀 할 일). 측정은 `--runs 8`(드문 FP 안정화, #1과 동일 자).

**전후** (conflicts):

| 프롬프트 / 시드 | conflicts precision | conflicts recall | conflicts FP | 비고 |
|---|---|---|---|---|
| baseline (`6dea9f9b`, 구 시드 10, 80회) | 0.882 | 0.938 | 2 | FP = 전부 "수수료 단점 ⚡ 토스→포트원 전환" |
| 조임 v1 (`66f7c38b`, 신 시드 13, 104회) | 1.0 | **0.542** | 0 | **과조임 — conflicts-clean이 replaces로 새고 골든 11건 놓침, 폐기** |
| 조임 최종 (`43c612a3`, 신 시드 13, 104회) | **1.0** | **1.0** | **0** | 전 종류 1.0/FP 0 (supports·replaces·resolves 무회귀) |

- **헤드라인**: 헛 충돌 FP **2 → 0**, 진짜 충돌 손실 없음(recall 0.938 → 1.0). conflicts는 게이트가 늘 pending이라 applied FP는 전 구간 0(조용히 박힌 거짓 충돌은 원래 없음) — 가치는 검토함에 올라오는 거짓 충돌 노이즈를 줄이는 것. 동일 자 증거: 구·신 시드 공통 시나리오(`invented-supports-dogfood`의 수수료 caveat)에서 FP가 사라졌다.

**발견 1 — 프롬프트의 예시가 FP를 가르치고 있었다.** 기존 예시가 caveat("포트원 정산 리포트 약함")을 `{ type: conflicts, confident: false }`로 내보내라 시키고 있었다 — 도그푸딩 헛 충돌의 직접 뿌리. 이 줄을 "caveat은 무관계(둘 다 참이라 충돌 아님), 침묵하라"로 고친 게 가장 큰 레버.

**발견 2 — 과조임의 축은 supports 전례와 동형(#1 발견 1과 짝).** v1은 "conflicts는 과발화된다, 의심하라" 톤으로 절을 키웠더니, 진짜 상호배타(자체구현 vs Supabase Auth)를 replaces로 내리거나 침묵해 recall 0.94→0.54로 무너졌다(`torn→conflicts` 규칙이 톤에 눌림). 최종본은 "caveat만 도려내되 **진짜 상호배타는 충돌로 살려라 — 교체·침묵으로 내리지 마라**"로 균형을 잡아 recall을 1.0으로 되살리며 FP만 제거했다. 조임의 레버는 "충돌 의심"이 아니라 "동시에 참이 되나"라는 한 칼금.

**발견 3 — 할 일(todo)은 미래 의도라 현재 충돌을 안 만든다.** "10MB로 결정"(claim) vs "50MB로 올리는 작업"(todo)을 v1에서 모델이 8/8 충돌로 오발할 거라 봤으나, 실제로는 8/8 **충돌로 안 봤다** — 할 일은 "바꿀 계획"이지 "지금 X가 참"이라는 주장이 아니라 결정과 *지금은* 둘 다 참(기껏해야 미래 replaces 씨앗). 핑퐁에서 세운 claim↔todo 양성 골든이 과한 주장이었다 → 해당 시나리오를 false-conflict 함정(golden 빈)으로 보정. 측정 #1 발견 2("supports의 `to`는 claim이어야")와 같은 결의 데이터 교훈 — 끝점 종류가 관계의 성립을 가른다.

**발견 4 — 질문은 충돌 끝점이 못 된다.** 결정된 주제에 질문이 재유입("결제 PG 뭘로?")되면, 엔진은 8/8 **resolves로 닫고 충돌은 0발**했다. 질문은 아무것도 주장하지 않아 결정과 부딪힐 수 없다(닫히거나 무관계).

**한계**: 시드가 13 시나리오 닫힌 세계라 전 종류 1.0은 시드가 작은 탓도 있다 — 자랑이 아니라 "방향이 맞다"의 작은 증거다. baseline은 구 시드(conflicts 골든 2/run), 최종은 신 시드(2/run + change-todo는 음성)라 conflicts 총 모수가 같진 않다(공통 시나리오로 동일 자 비교를 받친다). 이 프롬프트는 prod 워커가 그대로 쓰므로(③ 잇기) FP 감소가 곧 검토함 노이즈 감소다. 실데이터 보정은 brain 이주 때(relation-design §11).
