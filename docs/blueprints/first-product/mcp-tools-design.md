# MCP 도구 세트: 레일 위에 한 바퀴를 얹는다

> 이미 선 MCP 레일(원격 Streamable HTTP + Supabase OAuth + `list_topics`) 위에, 외부 LLM이 nema 줄기를 다시 켜서 묻고 되짚고 확정하고 무르는 한 바퀴를 도구로 얹는다. 새 엔진 능력은 만들지 않고 이미 빌드된 서비스(Source·DigestReview·Changeset·Narration 라우터)를 감싸는 것이 원칙이다. `mcpVisible` 게이팅만 서버에 새로 더한다(§1 "AI 게이팅").

대상: NEM-157 콘텐츠 입구의 Track B 후속. 형제 문서 `mcp-design.md`(레일 청사진)와 `narration-design.md`(해설 코어)를 전제로 깐다.

---

## 0. 왜 지금 이걸 하나

전략적 핵심은 이렇다. MCP 읽기 도구는 v2 앱 UI를 기다리지 않고 히어로(다시 켰을 때의 해설·re-entry)를 Claude Code에서 바로 도그푸딩하는 길이다. 베팅의 심장("뜻으로 다룸이 메모보다 신뢰가 가나")을 UI와 분리해 먼저 시험하는 자리다.

도구를 고르는 기준은 하나였다. "사용자가 Claude Code에서 이번에 실제로 부를 도구인가." 안 부를 것은 노이즈라 뺐다. 그 기준으로 §4의 한 바퀴(다시 켜기 → 묻기 → 되짚기 → 정리 → 사고 → 올리기 → 확정)를 끝까지 덮는 13종을 추렸다.

---

## 1. 도구 세트

`list_topics`는 레일과 함께 이미 깔렸다. 용어 사전 v2 반영 이후 실제 백엔드(`apps/server/src/routers`)는 `draft.*` 프로시저를 쓰지 않는다 — Source·Digest·DigestReview·Changeset이 그 역할을 나눠 맡는다(`07-modeling.md`). 도구 이름·매핑을 그 기준으로 다시 정리한다. 모두 같은 형태다. 입력은 `@nema-io/shared` 스키마를 재사용하고, 본문은 대응 tRPC 프로시저를 호출해 결과를 그대로 돌려준다.

**읽기·되짚기**

- `list_topics` (기존, `topic.list`) — Space 안에서 살아 있는 Topic 목록. 다시 켜기의 입구이자, 원문 제출 때 재사용할 Topic을 찾는 자리.
- `get_evidence` (`narration.evidence`) — Topic 범위 질의로 근거 진술 묶음(충돌·대체 표식 + 진술별 `sourceId`)을 조립해 돌려준다. 산문 합성은 호출한 LLM이 한다.
- `get_source` (`source.get`) — 진술이 가리키는 원문 전문을 펼친다. 충돌·의심을 원문까지 거슬러 확인하는 되짚기.

**넣기·Digest 리뷰**

- `submit_source` (`source.create`, origin=external) — 외부 결론을 새 원문으로 제출한다. 제출 즉시 Digest 추출이 시작되고, 그 원문은 초안(대기)에 진행 중 상태로 나타난다(`intake-flow.md`).
- `list_pending_sources` (`source.listPending`) — 아직 확정되지 않은(초안 상태) 원문 목록. v1의 "대기 초안 목록"에 대응하되, 가리키는 대상이 진술 후보 자체가 아니라 그 원문이다.
- `get_digest_review` (`digestReview.get`) — 추출이 끝나 열린 Digest 리뷰(ingestion changeset)의 Digest·Reference 후보 전문을 펼친다.
- `edit_digest_review` (`digestReview.update`) — 열린 Digest 리뷰의 후보 내용(제목·본문·Topic·Tag 등)을 확정 전에 고친다.

**확정**

- `confirm_digest_review` (`digestReview.confirm`) — 열린 Digest 리뷰를 확정해 Digest가 활성화되고 진술·관계 생성(2단계)이 시작된다.

**되돌리기·사람 개입**

- `list_changesets` (`changeset.listChangesets`) — 되돌릴 수 있는 변경 이력.
- `revert_changeset` (`changeset.revert`) — 변경 묶음 하나를 되돌린다(진술·관계까지).
- `archive_statement` (`changeset.archiveStatement`) — 진술 하나를 빼서 가린다. 충돌의 진 쪽을 닫을 때도 이걸 쓴다.
- `list_pending_relations` (`changeset.listPendingRelations`) — 관계 엔진이 보류한 관계 제안 목록.
- `apply_pending_relation` (`changeset.applyPendingRelation`) — 보류 관계를 승인해 세운다.
- `reject_pending_relation` (`changeset.rejectPendingRelation`) — 보류 관계를 거부한다.

**AI 게이팅** (`07-modeling.md`의 `mcpVisible`·`AccessLog` 참고)

- `get_gated_context` (신규, 백엔드 미구현) — `mcpVisible=false`로 표시된 Digest·진술·관계의 실제 내용을 조회한다. 위 읽기 도구들은 이런 콘텐츠를 존재 힌트 없이 완전히 제외하며, 이 도구를 거쳐야만 접근할 수 있다. 호출되는 순간 `AccessLog`에 남는다. 이 도구 호출에 클라이언트가 사람 확인 프롬프트를 강제로 띄우는지는 클라이언트마다 다르다(MCP 표준 애노테이션은 권고일 뿐 강제력이 없다) — nema가 보장하는 것은 "일반 경로로는 이 콘텐츠가 절대 안 나온다"는 것까지다.

---

## 2. 한 바퀴 매핑 (§4)

```
다시 켜기   list_topics
  묻기      get_evidence
  되짚기    get_source
  판정      list_pending_relations → apply / reject_pending_relation
  닫기      archive_statement (충돌 진 쪽)
  무르기    list_changesets → revert_changeset
  사고      (호출한 LLM이 get_evidence 위에서)
  올리기    submit_source → get_digest_review / edit_digest_review로 확인
  확정      confirm_digest_review
```

이 바퀴를 Claude Code 안에서 닫을 수 있으면, 앱 UI 없이도 히어로가 값을 하는지 직접 겪을 수 있다.

---

## 3. 확정을 도구로 노출한다 (사람 주권 재해석)

`mcp-design.md`는 "MCP는 확정하지 않는다"를 사람 주권의 불변식으로 두었다. 그 문서는 읽기 도구만 있던 시점이라 그 원칙이 "별도 장치 없이 자연히" 지켜졌다. 이번에 확정·되돌리기·빼기를 도구로 여는 결정은 그 불변식을 정면으로 건드리므로, 여기서 재정식화한다.

**불변식의 진짜 의도는 "AI의 자율 확정 차단"이지 "도구 표면 금지"가 아니다.** 사람 주권의 본질은 도구가 MCP냐 버튼이냐가 아니라, 사람이 의도를 갖고 직접 명령했나에 있다. GitHub에서 화면을 안 보고 LLM에게 merge나 revert를 시키는 일은 흔하고, 그렇게 시킨 merge는 LLM이 멋대로 한 게 아니라 그 사람이 한 것이다. 행위가 사람에게 귀속된다. 사람이 Claude Code에서 직접 "확정해"라고 명령한 확정도 마찬가지로 사람의 확정이다.

**봄을 도구로 강제하지 않는다.** §4의 확정·충돌 장면은 원문을 보고 판단하는 데 값이 있지만, 그 봄을 강제하는 것은 온정주의다. 사용자가 보고 결정하든 안 보고 시키든 그 사람의 몫이다. 게다가 충돌 확인에 필요한 봄은 이미 도구로 깔린다. `get_evidence`가 충돌 표식을 띄우고 `get_source`가 두 원문을 펼치니, 사람은 대화 안에서 보고 판단한 뒤 `archive_statement`나 `apply_pending_relation`을 부르면 된다. 봄이 CLI 안에서 닫힌다.

**막는 대신 받친다.** 확정을 여는 대가로 두 가지를 챙긴다. 하나, `confirm_digest_review`는 `submit_source`와 묶이지 않은 독립 도구다. 사람이 따로 "확정해"라고 명령해야 돈다. 도구 설명에 "사람 지시 없이 submit_source 뒤에 이어서 자동으로 부르지 않는다"를 명시해, AI 자율 확정을 누른다(도구로 사람 명령과 AI 자율을 완전히 구분할 수는 없으므로, 이건 차단이 아니라 억제다). 둘, `revert_changeset`이 받친다. GitHub에서 merge를 맘 편히 시키는 게 revert가 있어서이듯, 틀린 확정을 changeset 단위로 무를 수 있어야 부담 없이 부른다.

이 셋을 받아들이면 빼기·되돌리기·보류 관계 해소도 같은 논리로 MCP에 열린다. 사람이 직접 시키면 사람 주권이다.

---

## 4. 무엇을 뺐나

"실제로 부를 것만" 기준으로 다음은 뺐다.

- **narrate (해설 산문) — 재검토 필요.** 이 문서를 처음 쓸 때는 "MCP 소비자는 LLM이라 산문보다 원석(`get_evidence`)을 잘 소화한다"는 근거로 뺐다. 그런데 지금 `narration-router.ts`에는 `narrateText`(스트리밍 없이 산문까지 완성해 반환)가 이미 있고, 코드 주석에 "구독을 못 타는 입구(MCP tool)가 앱과 같은 해설을 받는 길"이라고 명시돼 있다 — 즉 MCP를 염두에 두고 이미 만들어진 프로시저다. 이 문서가 뺀 이유와 실제 백엔드가 준비된 이유가 정면으로 부딪히므로, `get_narration`(`narration.narrateText`)을 도구로 열지는 다시 판단해야 한다.
- **delete_pending_source (초안 상태 원문 삭제)** — 확정 전 대기열 청소라 위험은 낮지만, 직접 앱에서 보고 지우는 게 안전하고 직관적이다. CLI에서 LLM에게 시킬 빈도가 낮다.
- **archive_source (원문 빼기)** — 원문을 가려도 거기서 나온 진술·관계는 남는다. 그런데 사용자 멘탈 모델에선 "원문을 지운다"가 "아예 사라진다"로 기대되어 불일치가 생긴다. 잘못 올린 걸 무르는 평범한 경우는 `revert_changeset`이 덮는다. archive와 revert의 구분은 라벨·확인으로 푸는 앱 UI의 몫이다.

---

## 5. 만들 것 / 고치지 않을 것

**서버 (`apps/server`) — 이미 있음**

- `source.create`·`source.listPending`·`source.get`, `digestReview.get`·`update`·`confirm`, `changeset.*`, `narration.evidence`·`narrateText`가 라우터에 이미 구현돼 있다(§1의 13종 도구가 그대로 얹을 수 있는 상태). 새로 만들 서버 로직은 `get_gated_context`가 기댈 `mcpVisible` 필터·`AccessLog` 기록(`07-modeling.md`)뿐이다.

**MCP (`apps/mcp`)**

- §1의 13종 도구 등록. 각 도구는 입력 스키마 재사용 + tRPC 호출 + 결과 반환의 한 형태를 따른다.
- `get_gated_context`는 서버 쪽 필터·로깅이 먼저 구현된 뒤에 추가한다.

**고치지 않는 것**

- Track 0 계약(테이블·함수·tRPC), 기존 엔진, `apps/server`의 인증 로직, `mcp-design`이 세운 레일(통신·OAuth·배포).

---

## 6. 자기 점검 (§10)

1. 다시 켜는 순간을 돕는가: `list_topics` → `get_evidence` → `get_source`로 줄기 맥락을 복원하는 길이 곧 히어로다. 그렇다.
2. 신뢰를 올리는가: 몰래 지우지 않는다(`archive_statement`는 가리기). 되돌릴 수 있다(`revert_changeset`). 확정은 사람이 직접 명령해야 돌고 무를 수 있다. 그렇다.
3. 넣기가 가벼운가: 외부 LLM이 도구 호출로 바로 닿고, 다시 다듬지 않는다. 그렇다.
4. 큰 그림이 먼저인가: `get_evidence`가 근거 묶음(큰 그림)을 주고, 원문 전문은 `get_source`로 부를 때만 펼친다. 그렇다.
