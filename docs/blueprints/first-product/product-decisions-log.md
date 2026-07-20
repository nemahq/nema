# Nema 제품 결정 로그 (열린 결정 소진)

> 결정 인벤토리 comb(2026-07-10)로 뽑은 열린 결정들을 하위 세션 구현과 병렬로 미리 확정한 기록. 각 결정은 해당 슬라이스 착수 시 이 로그를 근거로 바로 반영.

## #1 Digest 본문 내 @멘션(Reference) 저장형식 — (확정)

**결정: (a) 본문 `string`에 인라인 마커 `@[ref:uuid]` 삽입.**

- 걸리는 곳: review/browsing의 @멘션 편집·새 Reference 생성. 여러 슬라이스의 선행조건.
- 근거: Digest는 자유 저작 문서가 아니라 "증류된 타입 단위" — 구조는 타입 스키마 + Statement 쪼개기가 제공하므로 본문 리치 서식 수요가 낮음. 본문이 임베드할 건 엔티티 참조(@Reference)+statement 마커뿐이고 그건 인라인 마커가 다룸. narration `[s:id]` 마커와 같은 계열이라 파싱·렌더 재사용, 기존 추출·검색이 본문 string 위에서 도는 것 그대로 유지(blast radius 최소).
- 기각: (b) 노드 배열 = 본문 저장 전환 + 이를 읽는 모든 시스템 재작업(blast radius 큼), 리치 수요 낮아 불필요. (c) 오프셋 사이드테이블 = 편집 시 오프셋 드리프트로 열등.
- 헤지: 훗날 경량 서식(불릿 등)이 필요하면 (a) 유지한 채 본문 string을 lightweight 마크다운으로 렌더 — 저장 마이그레이션 없이 커버.

## #2 휴지통(Trash) 표면 MVP 포함 여부 — (확정)

**결정: (a) MVP에 자가 복원 UI 안 둠.**

- 걸리는 곳: browsing/intake(삭제 액션 무게), workspace(LNB 구성). surface-inventory 내부 모순(LNB 절 "안 둠" vs 별도 휴지통 절 "둠) 해소 — 별도 `## 휴지통` 절을 삭제/보류로 정리.
- 근거: Source 삭제는 파생물(Digest·Statement·Relation) 되돌리기를 캐스케이드하므로 복원 시맨틱이 복잡 → MVP에 안전·정확히 노출하기 무거움. 단 trashed→30일→purge라 즉시 하드삭제가 아니어서 백엔드 30일 버퍼가 backstop(진짜 비가역 아님, 필요 시 수동 회수). 유저 삭제는 의도적·무거운 확인 거쳐 하나씩이라 사고 위험 제한적.
- post-MVP: 복원 시맨틱 정리되면 (b) LNB 휴지통 + 복원 재검토.

## #3 Digest "공유" 출력 형식 — (확정)

**결정: (b) 마크다운 클립보드 복사 (MVP). 공개 링크는 post-MVP 성장 기능으로 로드맵.**

- 걸리는 곳: browsing-flow(Digest 상세 "공유").
- 근거: 명세가 "단순 URL 아니라 복사·전달 가능한 형태"로 링크를 이미 배제. 마크다운은 평문으로도 읽히고 마크다운 인식처(Notion·GitHub·채팅)에선 서식 렌더 → "복사·전달 가능"의 lingua franca. 타입/제목/요약/본문 구조에 매핑. 공유 시 본문 `@[ref:uuid]` 마커는 표시 이름(@Name)으로 해석해 내보냄(#1 연결).
- GTM 논의: 공개 읽기전용 링크가 순수 성장 레버로는 상위(비유저 노출·바이럴). 다만 (1) 접근/노출 정책을 새로 설계해야 하고(워크스페이스 비공개 맥락 유출 위험), (2) 지금은 스텔스·pre-PMF라 링크가 전환할 퍼널이 없음, (3) 실질 스코프. → **공개 링크는 접근 모델 설계 + 공개 출시 타이밍에 맞춘 의도적 성장 기능으로 post-MVP.**

## #4 오래된 판단 서피싱 임계값 — (확정)

**결정: (b) 타입별 차등. pending 14일 / assumption 30일.** (명명 상수, 실사용 보고 튜닝)

- 걸리는 곳: browsing-flow("오래된 판단만" 필터·배지). 메커니즘은 #374에서 이미 구현, 상수만 비어 있었음. 대상은 미해결성 타입(pending·assumption)만 — decision/learning/idea는 제외.
- 근거: pending(미결)=닫아야 할 열린 질문, 쌓이면 병목 → 빨리 상기(짧게). assumption(가정)=딛고 가는 믿음, 검증 없이 오래 가면 위험 → 주기적 재검토면 충분(길게). 의미 차이를 반영, 비용은 상수 하나 vs 둘.

## #9 Space 삭제 정책 — (확정)

**결정: 완전삭제 cascade + 이름 타이핑 확인 + 영향 개수 표시 + 삭제 후 홈으로 이동.**

- 걸리는 곳: workspace-account-flow(Space 삭제). min-1 확정이라 Space 2개 이상일 때만 도달.
- 콘텐츠: Space + 그 안 콘텐츠 완전삭제 cascade(백엔드는 Source purge 패턴 재사용).
- 확인 강도: 이름 타이핑 확인(유지). **영향 개수 표시는 드롭**(2026-07-10 구현 시 결정) — 개수의 근거였던 "블라스트 반경 노출"은 삭제 규모가 숨겨졌을 때만 값어치가 있는데, Space는 **오버뷰의 스레드 피드가 곧 그 콘텐츠**라 규모가 이미 화면에 보임 → 개수는 오버뷰와 중복. 숨은 cascade도 없음(Reference는 Workspace 스코프라 생존, 나머지는 전부 Space 로컬이라 오버뷰에 드러남). 실수 방지는 타이핑 확인이 커버. 원안 근거: #2 비가역 + "맥락은 자산".
- 이동: 홈. 근거 — 로그인 랜딩의 "예측 가능한 착지, 마지막 활성 Space 기억 안 함" 원칙과 정합.

## #8 관련 Reference 자동 제안(relatedReferenceIds) — (확정)

**결정: 자동 제안 MVP 포함. 엔진 자동 적용(되돌리기 가능·사람 정리 불필요). 매칭 = Digest 단위 공동 인용.**

- 걸리는 곳: review-flow(관련 Reference), Reference 상세. 저장은 `reference_links`(무방향). 참고: 코드엔 수동 `create_reference_link`만 있고 자동 제안은 미구현 — 이번에 자동 경로를 MVP로 넣기로.
- 자동 적용 근거(anti-wiki): 사람이 관련 항목을 손으로 정리해야 하면 그게 위키 유지보수 실패 패턴. 엔진이 자동 링크, 사람은 강요된 큐레이션 없이 원하면 changeset으로 되돌림. Nema "confident 자동 반영·불확실한 것만 사람 판정" 모델과 일치. 확인됨: reference_links는 표시/탐색 전용, 다운스트림 자동효과 없음 → 자동 적용해도 오염 아니라 가벼운 표시 노이즈.
- 매칭 근거: Digest는 이미 증류된 coherent 단위라 그 안 공동 인용은 엔진의 관련성 경계를 물려받음. Source 단위=너무 넓어 노이즈(한 Source→여러 Digest), Statement 단위=너무 좁아 같은 맥락 관계 놓침. "존재 조건 = 1 Digest 공동 인용"이 최적, "강도(랭킹/가중치) = 반복 빈도"는 별개 후속 레이어(나중에 표시 랭킹·retrieval 연결 시).
- UX 가치(참고): 근시일=탐색(see also)+우연한 연결 발견(auto의 값). 중기=차가운 맥락 재진입·온보딩의 엔티티 지도. 높은 천장=엔티티-aware 해설(단 retrieval 연결 필요, 보류 검색 클러스터에 게이트). 조직에선 공유 엔티티 지도로 값 증대.

## #11 컴플라이언스 즉시 삭제 경로 — (확정)

**결정: (a) 셀프서비스만 (trashed→30일→배치 purge). 관리자 즉시 purge 경로는 미도입.**

- 근거: trashed 시 노출은 즉시 중단(컴플라이언스 급한 부분 충족), 물리 삭제만 30일 지연. 07-modeling "열어두는 것 ①"도 미확인으로 둠 → 실제 요청 생기면 관리자 경로 추가. 없는 니즈에 인프라 선투자 안 함.

## #12 Reference archived 복구 표면 — (확정)

**결정: (a) Reference 목록에 상태 필터(active/archived) 추가.**

- 근거: 목록 화면이 이미 있고 type·tag 필터를 가져 결이 같음 → 필터로 저렴하게 발견+복구, 새 화면 불필요. 아카이브는 드문 수동 액션이라 복구도 가벼운 엣지.

## #13 AccessLog 표시 위치 — (확정)

**결정: (c) MVP 미노출(기록만).**

- 근거: 기록 시점·모델은 확정, 데이터는 계속 쌓임. "누가 내 민감 맥락 봤나" UI는 실제 니즈 생길 때 별도 화면으로. MVP에 없어도 핵심 루프 안 막힘.

## #14 계정 삭제 확인 강도 — (확정)

**결정: 타이핑 확인 — 본인 이메일 주소 입력, 일치해야 삭제 버튼 활성화.**

- 걸리는 곳: workspace-account-flow(계정 삭제). 백엔드는 이미 완비(account-router).
- 근거: 계정 삭제는 워크스페이스까지 날리는 가장 비가역·고위험 액션 → 버튼 1회보다 타이핑 확인. Space 삭제(#9)의 타이핑 확인과 일관(계정 삭제가 더 무거우니 당연). 본인 이메일을 확인 문자열로(유저가 아는 값, GitHub류 패턴).
- 관련: ContentLanguageSection은 Settings UI에서 숨김(profiles.content_language는 의도적 dead signal이라 백엔드 필드는 유지, 무효과 컨트롤을 UI에 노출하지 않음) — [[project_content_language]]와 일치.

## #15 Source 제목 — (확정)

**결정: Source에 제목 있음. 단 사람이 작성 시 넣지 않고 자동 채움. 편집은 특정 상태에서만.**

- 걸리는 곳: intake-flow(Source 제출·제목 편집), review 경계. 와이어프레임 자체 모순(주석 "제목 없음" vs 마크업 title input vs 스키마 title 컬럼 없음) 해소.
- 스키마: sources에 title 컬럼 신설(현재 없음).
- 채움: (a) 인제스천 시 LLM이 채움, (b) 추후 외부 연동(Slack·Tiro) 시 그쪽 맥락 메타데이터로 자동. 사람은 작성 시 제목 미입력 — 컴포저는 raw 붙여넣기만.
- 사람 편집: **pending 상태 + 인제스천 중이 아닐 때만** 제공. "Source 제목 편집" 케이스 유지(게이팅).
- 근거: 사람이 upfront로 제목 붙이는 부담 없이(= 작성 시점엔 여전히 raw), Source에 스캔 가능한 식별자를 줌. 제목이 엔진 파생 메타데이터라 "untouched raw" 성격과 충돌 안 함.
- intake 슬라이싱: **1차 슬라이스(FE-only) 영향 없음**(컴포저 제목 없음, 목록은 미리보기/상태로, 제목 미충전 시 placeholder). **제목 기능(컬럼+LLM채움+편집)은 별도 후속 BE+FE 슬라이스**(마이그레이션 → 2-PR/로컬검증).

## #16 기존 Reference 병합 편집 — 다듬음 완성본 교체 (확정)

**결정: 기존 Reference가 다시 언급되고 새 정보가 있으면, 엔진이 '기존 설명 + 새 정보'를 녹인 완성본(body 전체)을 제안 → 사람이 리뷰에서 편집 → 확정 시 references.body를 통째로 교체.**

- 걸리는 곳: review-flow "기존 Reference 후보 병합 편집". glossary "새로 쌓이지 않고 기존 것이 다듬어진다".
- 대안 "새 정보만 덧붙임(append)"은 시간이 지나면 body가 조각으로 쌓여 glossary 원칙과 어긋나 기각.
- 시맨틱: 병합은 인용된 기존 Reference에만(미인용 제안은 노이즈로 폐기), 새 정보 없는 단순 인용은 제안 없음(body 그대로·읽기 전용). type·title 읽기 전용, body만 편집.
- 비용: 엔진이 다듬으려면 기존 body를 프롬프트에 실어야 함(기존엔 label·type·title만) — 재사용 후보 상한(REGISTRY_PROMPT_LIMIT=200)만큼 body가 실려 토큰 부담. dogfooding 데이터로 상한 조정 예정(PM 수용).
- 동시성 단순화(첫 출시): 확정은 워크스페이스 전역 Reference의 body를 교체한다. 생성~확정 사이 그 Reference가 archive되면 조용히 건너뛰고, 그 사이 다른 경로가 body를 바꿨어도 last-write-wins로 덮는다(update_reference의 in-place modify와 같은 계약). {before, after} modify Change로 남겨 자기완결.

## 보류 (추후 재논의) — retrieval/검색 클러스터

검색은 Nema 핵심 기능이라 지금 급히 못박지 않고, Kyle의 검색 지식이 깊어질 때 검색/retrieval 설계와 함께 첨예하게 다룬다. 아래 3개를 한 묶음으로 보류.

- **#5 질문 @멘션 범위 시맨틱 (비-Topic)**: Space/Topic/Tag 하드필터 부분은 아키텍처 독립적이라 결정 가능하지만, Reference/Digest의 "seed+확장"은 검색 코어(자동 scoping·rerank·multi-query 등 미설계)와 얽혀 검색 설계와 함께 정함. 전체 보류.
- **#6 판정 대기(open) 관계를 해설 근거로 포함·표시**: narration 근거 조립에 open changeset을 넣고 "미결" 표식할지. 명세는 (a)포함 요구, narration 코어엔 없음.
- **#7 후속 질문의 이전 맥락 해석 (단발 vs 맥락 참고)**: 명세(참고함) vs narration-design §9(매번 독립 질의) 정면 충돌.

## 실시간 갱신 아키텍처 (pull vs push) — Supabase Realtime 채택 (확정)

**결정: Supabase Realtime(Postgres CDC)로 push. 초안 탭·Space/변경사항 배지 모두 이 방식으로 통일하고 기존 폴링은 완전히 걷어낸다.**

- 걸리는 곳: 비동기 작업(AI가 초안 정리 → Changeset 생성) 완료를 사람이 놓치지 않게 하는 신뢰 구조의 전제조건. `usePendingSourceListQuery`(초안 탭·LNB)의 조건부 2초 폴링과, 갱신 신호가 아예 없던 Space LNB 배지(`useSpaceList`)·변경사항 탭 배지(`useChangesetListQuery`)를 함께 해결.
- 근거: 이미 Supabase를 쓰고 있어 커스텀 웹소켓 서버가 불필요. `sources`·`changesets`에 RLS가 이미 걸려 있어 Realtime 브로드캐스트도 구독자 Space 범위로 자동 스코프됨.
- **핵심 판단 — invalidate만, patch 안 함**: 이벤트 payload를 클라이언트 캐시에 직접 patch하지 않고 "뭔가 바뀌었다" 신호로만 써서 해당 쿼리를 `invalidate()`한다. payload 기반 동기화는 서버 응답 shape이 조금만 바뀌어도 클라이언트 재구성 로직이 깨지기 쉬운 반면, invalidate는 검증된 기존 조회 로직(RLS 필터 포함)을 그대로 재사용해 견고하다. 부수 효과로, RLS 범위 밖 이벤트가 새더라도 자기 데이터를 다시 읽을 뿐이라 유출이 없다.
- 구독 스코프: 워크스페이스 전체(서버측 필터 없음) — RLS가 이미 스코프하고, invalidate만 하므로 Space별 필터를 따로 관리할 이득이 없다.
- 폴백: TanStack Query 기본 `refetchOnWindowFocus`를 재연결·복귀 안전망으로 유지. Realtime 재연결·토큰 갱신은 supabase-js가 자동 처리(auth 이벤트 → `realtime.setAuth`).
- 구현: 마이그레이션(`ALTER PUBLICATION supabase_realtime ADD TABLE`) + 앱 세션당 1회 마운트되는 구독(`useRealtimeInvalidation`, AppLayout). 연결 자체는 유닛 테스트 불가라 탭 두 개로 수동 검증.

## #17 Changeset.title 스키마 도입 — (확정)

**결정: `changesets.title text` nullable 컬럼 신설. number(#14의 트리거 방식)와 달리 공용 트리거로 못 채우고, 타입별 생성 RPC 안에서 각각 명시적으로 채운다. ingestion만 예외로 Source 제목의 비동기 갱신을 트리거로 전파한다.**

- 걸리는 곳: review-flow(Changes 탭·Changeset 상세·Digest 리뷰 헤더). #15(Source 제목)의 자매 결정이자, `20260714140000_changeset_number` 마이그레이션 헤더 주석이 "title은 다음 슬라이스"로 남겨둔 백로그의 후속.
- **number처럼 단일 트리거로 못 묶는 이유**: number는 어느 타입이든 "다음 정수"라 원천 데이터가 필요 없어 BEFORE INSERT 트리거 하나로 충분했다. title은 타입마다 원천이 다르고(ingestion=Source 제목, relation=끝점 두 Statement가 속한 Digest 제목 조합, revert=원본 제목, manual=대상 콘텐츠 제목), 특히 relation의 원천(from/to statement id)은 changesets INSERT 시점엔 아직 없는 `changes` 자식 행에 있어 BEFORE INSERT 트리거로 계산 자체가 불가능하다 — 그래서 `create_ingestion_review`/`apply_relation_changesets`/`revert_changeset`/`confirm_digest_edit`/`update_reference`/`archive_reference` 안에서 각각 채운다.
- **ingestion 비동기 동기화 — 트리거 채택**: title 생성 LLM 콜(`fill_source_title`)이 다이제스천 완료 콜과 분리돼 있어(`20260715090000`), changeset 생성 시점에 `sources.title`이 아직 없을 수 있다(둘의 도착 순서가 레이스). 착지 지점이 `fill_source_title`(엔진)과 `update_source_title`(사람 편집 — `update_source_body`와 달리 열린 리뷰 중에도 허용) 두 곳이라, 각 RPC에 개별 UPDATE를 심는 대신 `sources` `AFTER UPDATE OF title` 트리거 하나로 연결된 `type='ingestion'` changeset의 title을 동기화한다 — number 트리거와 같은 논리(흩어진 착지점 전체를 앞으로도 자동으로 따라가게).
- **relation — pending 제안만**: 사람이 판정하는 pending 제안(changeset 1개 = Statement 쌍 1개, `20260707170000` 이후 conflicts·duplicates 모두 여기로 흐름)만 끝점 Digest 제목을 "A vs B"로 합쳐 채운다. `apply_relation_changesets`의 applied 배치(자동 적용, 여러 쌍이 한 changeset에 실림)는 단일 제목이 안 맞아 제외 — 계속 effect 기반 표시로 남는다.
- **revert — 원본 title + " 되돌림"**: 원본이 null이면 그대로 null 상속(원본도 폴백 중이라는 뜻이므로). redo 체인은 재귀적으로 겹쳐 쌓인다("X 되돌림 되돌림") — 실제로 되돌리기를 두 번 한 상태를 그대로 반영하는 것이라 의도된 동작.
- **manual — 범위를 브리핑보다 넓힘, 단 archive_source는 대상에서 제외**: 브리핑은 Digest 수정(`confirm_digest_edit`)만 예시로 들었지만, `update_reference`/`archive_reference`도 대상 행에 title이 이미 있어 추가 조회 없이(RETURNING 컬럼만 확장) 같은 패턴을 일관되게 적용할 수 있어 함께 채웠다. `archive_statement`는 대상(Statement)에 title 개념 자체가 없어 제외. `archive_source`는 처음엔 같은 이유로 넣었다가 뺐다 — v2 Source 상태 모델(`20260706112433`)이 이미 이 RPC를 제거했고("active에서 원본만 빼기"가 v2엔 없는 동작), 지금 "빼기"에 해당하는 `trash_source`는 changeset을 아예 안 만든다(같은 마이그레이션: "삭제·복원은 변경이력에 남기지 않는다").
- **백필**: ingestion=그 시점 Source 제목, manual=대상 콘텐츠의 현재 제목(Reference `modify`는 `changes.data.after.title`이 있으면 그 편집 시점 값을 우선하고, 없으면 — title 자체는 그 편집으로 안 바뀌었다는 뜻이라 — 현재 값을 그대로 씀), relation=pending 제안만 재계산, revert=원본 title 체인이 수렴할 때까지 반복 적용. 전부 한 마이그레이션 파일 안에서 스키마·RPC·백필을 함께 실행(`20260714140000`과 같은 단일 파일 관례).
- **로컬 실행 검증 범위 — 코드 리뷰만, 실행은 CI가 처음**: 워크트리 공유 로컬 Supabase(고정 포트, 전 워크트리 공유)가 이 작업과 동시에 진행 중인 `polish/changeset`(미병합, 아래 참고)의 마이그레이션을 이미 적용해둔 상태라, 격리된 실행 검증이 마땅치 않았다(Kyle 확인 후 코드 리뷰만으로 진행하기로 결정). 그 대가를 실제로 치렀다 — `apply_relation_changesets`를 오래된(4-arg, `p_duplicates` 파라미터 포함) 버전 기준으로 다시 만들고, 이미 `20260706112433`에서 제거된 `archive_source`를 되살리는 실수를 코드만으로 하고 CI가 첫 실행에서 잡아냈다(`database.types.ts` 드리프트 체크가 `apply_relation_changesets` 오버로드 중복을 감지). 마이그레이션 히스토리를 grep 결과 하나로 판단하지 않고 각 함수명이 언급된 파일 전부를 시간순으로 실제로 열어 최신 정의를 재확인해야 한다는 교훈 — 특히 CREATE OR REPLACE가 겹쳐 쓰인 여러 파일을 순서대로 읽을 때 앞서 읽은 다른 함수의 내용과 섞어 기억하지 않도록 주의.
- **`polish/changeset` 머지 이후 — 리베이스 + 두 가지 추가 정합성 문제**: PR 오픈 중 `polish/changeset`(#434)가 먼저 staging에 머지됐다. `origin/staging`에 리베이스하면서 (1) `utils.ts` 충돌은 #434의 `summarizeChangesetEffect`(digest·reference 전용 diffstat 요약, title과 별개로 상시 노출)를 그대로 유지하고 `changesetDisplayTitle`만 `sourceTitle` 대신 `title`을 읽도록 교체해 해소했다 — 두 표시가 서로 다른 목적(제목 vs 리뷰 크기 가늠)이라 경쟁하지 않는다. (2) #434가 함께 들여온 `20260717140000`(ingestion changeset의 `author_id`는 항상 null이어야 한다는 버그 수정)보다 이 마이그레이션의 `create_ingestion_review`가 시간순으로 나중에 실행되는데, 그 수정 이전 버전을 기준으로 다시 작성해서 `author_id`를 도로 채우고 있었다 — #434가 함께 추가한 통합 테스트가 로컬에서 바로 잡아냈다. 두 문제 다 "다른 브랜치가 먼저 머지되면 내 브랜치가 재정의하는 함수의 '최신'이 바뀐다"는 같은 근본 원인 — 리베이스 직후엔 내가 손댄 함수마다 최신 정의를 다시 확인해야 한다.
- **트리거 — 닫힌(non-pending) changeset의 title은 소급 갱신하지 않음**: 처음엔 `type='ingestion'` 조건만 걸었는데, 한 Source에 되돌리기 이후 재인제스천으로 ingestion changeset이 두 번째로 생기는 경우 이미 확정(`applied`)된 첫 번째 changeset의 title까지 이후 Source 제목 편집에 소급으로 덮어써졌다 — changes는 append-only·불변 기록이라는 07-modeling 원칙과 어긋난다(코드리뷰 지적, `status = 'pending'` 가드 추가로 해소).
- **통합 테스트 — RPC 7개 중 title 로직이 실제로 까다로운 3곳만**: `create_ingestion_review`(생성 시점 초기화)·트리거(비동기 갱신 + 위 status 가드)·`apply_relation_changesets`(끝점 Digest 조합)·`revert_changeset`(체인)에 로컬 Postgres 직결 통합 테스트를 추가했다(`changeset-service.integration.test.ts`, 기존 author_id 회귀 테스트와 같은 파일·패턴). `confirm_digest_edit`/`update_reference`/`archive_reference`는 대상 행의 title을 그대로 복사하는 자명한 매핑이라 유닛 테스트 수준의 가치가 없어 스킵 — "커버리지를 위한 테스트는 안 만든다" 원칙과 일치.
- **`polish/changeset`(wt-3, 미병합)와의 겹침**: 그 브랜치가 이미 `sourceTitle` 기반의 다른 해법(폴백 문구 `review.changeset_fallback_title`="{번호}번째 변경사항" 도입 + `summarizeChangesetEffect`를 별도 diffstat 표시로 재활용 + `changesets.author_id` 노출 + "변경셋"→"변경" 용어 정정)을 `apps/web/src/features/review/*`·`apps/server/src/services/changeset-service.ts`에 이미 적용해 두고 있다. 이번 슬라이스는 그 폴백 문구 텍스트만 그대로 재사용했고(동일 i18n 키·값), 나머지(용어 정정, author 노출, diffstat 레이아웃)는 손대지 않았다 — 두 브랜치 중 나중에 머지되는 쪽이 `apps/web/src/features/review/utils.ts`·`changeset-service.ts`·`apps/web/src/lib/tolgee/{en,ko}.json`에서 리베이스 충돌을 겪을 것이 확실하므로, 머지 순서를 미리 정하거나 리베이스 시점에 이 문서를 참고할 것.

## #18 Changeset 단건 조회 신설 + listChangesets는 메타데이터 전용 유지 (확정)

**결정: `changeset.getByNumber({spaceId, number})` 신설(apps/server/src/services/changeset-detail-service.ts). listChangesets는 changes.data(실제 변경 콘텐츠)를 절대 얹지 않고 지금처럼 메타데이터 전용으로 남긴다 — 상세 콘텐츠(스냅샷 등)가 필요해질 때마다 list 응답을 키워 재사용하지 않고, 전용 단건 조회에서만 반환한다.**

- 걸리는 곳: review-flow "Changeset 상세"(폴리싱 세션의 본문 작업 블로커). 지금까지 이 화면은 전용 단건 조회가 없어 listChangesets(최근 100건 캐시)를 number/id로 스캔해 썼는데, (a) 100건 밖의 오래된 changeset은 못 찾고, (b) 더 근본적으로 listChangesets는 changes.data를 원래도 안 내려줘 target_type별 개수(effect)만 셀 뿐 — 상세 화면 본문(스냅샷 카드) 자체를 만들 콘텐츠가 없었다.
- 대안(listChangesets 응답에 콘텐츠를 얹어 100건 문제만 우회)은 기각 — list는 무한 스크롤로 훑는 화면(변경사항 탭)의 계약이라 가볍게 유지해야 하고, 상세를 한 번도 안 여는 사용자에게까지 그 무게를 강제하면 안 된다.
- URL도 changesetId(UUID)에서 changesetNumber로 전환 — number가 Space당 유니크한, 사람이 읽는 안정적 앵커라(GitHub PR 번호와 같은 역할) 별도 opaque id가 필요 없다(Space public_id, #395와는 다른 패턴 — Space는 이런 식별자가 없어 opaque id를 새로 만들었던 것과 대비).
- **발견한 갭 — relation 판정 모드(승자·패자, Digest 병합)가 백엔드에 없음**: surface-inventory.md·review-flow.md는 충돌 판정 시 패자 진술 archive, 중복 판정 시 두 Digest를 병합해 새 Digest를 만드는 것으로 서술하지만, 실제 `apply_pending_relation` RPC(`20260707170000_duplicates_as_relation.sql`)는 충돌이면 관계 엣지만 만들고 아무것도 archive하지 않으며, 중복이면 진술 하나(duplicate)만 archive할 뿐 Digest 병합이 없다 — 판정 모드(승자 선택 UI·병합 UI) 자체가 아직 어디에도 구현돼 있지 않다. `getByNumber`는 지어내지 않고 지금 실제로 있는 것(from/to 진술 각각의 Digest 스냅샷)만 그대로 반환한다 — 판정 모드는 별도 설계·구현이 필요한 후속 스코프.

## #19 Digest 리뷰 편집 상태 — 화면 인스턴스 zustand store로 전환 (확정)

**결정: 리뷰 편집 상태를 `useReviewEditingState`(useState 8개)에서 `reviewEditingStore`(zustand `createStore` + Context 주입)로 옮긴다. 전역 싱글톤 store는 만들지 않는다 — 화면당 인스턴스라 화면을 벗어나면 store째 소멸한다. 파생 계산(`computeReviewEditingState`)은 순수 함수 파일에 그대로 두고 store는 상태 보관과 dispatch만 맡는다.**

- 걸리는 곳: review-flow "실행취소·다시 실행"(세션 스코프), "새로고침 후 최신 저장 상태 유지", "@ 멘션 — 새 Reference 생성", "원문 대조 포커스 전환". 넷 다 지금 구조로는 표현 자체가 안 된다.
- 근거 ①(실행취소): 편집이 useState 8개(`titleOverrides`·`bodyOverrides`·… )로 흩어져 있어 그 사이를 가로지르는 시간 순서가 어디에도 없었다 — "가장 최근 액션"이라는 개념이 성립하지 않는다. 단일 `dispatch`로 모으면 액션 로그가 곧 실행취소 스택이 되므로, 나중에 얹을 때 컴포넌트는 건드리지 않는다.
- 근거 ②(구독 범위): "@ 멘션 → 새 Reference 생성"은 Digest 본문 편집이 Reference 후보 목록을 바꾸고, "원문 대조 포커스 전환"은 카드가 형제 패널과 연동된다 — 상태를 카드로 내릴 수 없다. 그런데 Context로 올리면 selector가 없어 어느 필드가 바뀌든 모든 소비자가 리렌더된다. 이 딜레마를 푸는 게 selector 구독이고, 그게 zustand를 들이는 유일한 이유다.
- 대안(Context + useReducer)은 기각 — 근거 ①만 풀고 ②를 못 푼다. 다만 dispatch 구조가 같아 나중에 store로 바꾸는 건 내부 교체라, 이 결정이 틀렸다고 판명돼도 되돌리는 비용은 낮다.
- **적용 범위는 이 화면 하나뿐**: 기존 Context 7개 중 리렌더가 실제로 문제인 건 `ChatLifecycleContext`(LLM 토큰마다 13필드 값 객체가 재생성돼 소비자 11개가 전부 리렌더)였는데, 세션 채팅은 v1(URL로만 접근 가능) 표면이라 삭제 예정이다. 나머지(`Sidebar` 2필드, `auth` 세션 객체, `ThemeProvider`)는 갱신이 드물어 Context가 맞다 — "store를 들였으니 다 옮긴다"가 되지 않도록 `apps/web/CLAUDE.md`에 두 조건(콜로케이션 불가 + 구독 분리 필요)을 동시에 만족할 때만 쓰도록 못 박았다.
- 위치는 `features/review/` 안(`src/stores/` 신설 기각) — 소비자가 이 feature 하나뿐이라 기존 co-location 규칙("used in one feature only, keep it inside that feature")에 그대로 맞고, ESLint `boundaries/elements`가 `src/` 루트 폴더만 분류하므로 새 루트 폴더는 element 타입 추가 없이는 import 전부가 lint 에러가 된다. feature 내부에 두면 `boundaries/entry-point`가 다른 feature의 접근까지 자동으로 막아준다.
- override Map 구조는 그대로 유지 — 원본(엔진 제안)과 편집값을 분리해 들고 있어야 "엔진 제안 대비 교정 신호 기록"을 확정 시점에 뽑을 수 있다. 편집값을 원본에 머지하면 그 기능이 구조적으로 불가능해진다.
