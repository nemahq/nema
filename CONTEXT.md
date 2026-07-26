# Nema — Context

> AI 시대에 "왜 이렇게 됐는지"가 사라지지 않게 만드는 제품. 이 문서는 신규 기여자·AI가 어느 문서를 언제 참고할지 찾는 인덱스다.

## 1. 철학/전략: 왜 이 제품인가

- [01-problem](docs/foundations/01-problem.md): 무슨 문제를 왜 푸는지. 존재 이유에 의문이 들 때
- [02-strategy](docs/foundations/02-strategy.md): 거인(모델 오너)에게 안 먹히고 이기는 자리. 새 결정이 해자를 깎는지 판단할 때
- [03-solution](docs/foundations/03-solution.md): 맥락 생애주기 중 어디를 풀고 어디를 안 푸는지. 스코프 경계가 헷갈릴 때
- [faq](docs/foundations/faq.md): 예상 반론과 답. "그냥 X로 되지 않나" 류 질문에

## 2. 핵심 개념/모델링: 도메인을 어떤 개념으로 보는가

- [04-concept-context](docs/foundations/04-concept-context.md): 맥락의 단위(진술)와 그 도출 근거
- [05-concept-meaning](docs/foundations/05-concept-meaning.md): 의미로 다룬다는 것, 엔진·사람 분업 원칙
- [06-concept-relation](docs/foundations/06-concept-relation.md): 관계 종류와 그걸 정한 근거
- [07-modeling](docs/foundations/07-modeling.md): 전체 엔티티 모델(SSOT). 필드·타입·동작 규칙은 여기서 확인
- [10-concept-collaboration](docs/foundations/10-concept-collaboration.md): 협업 기반 개념(Space·Share·Group·Workspace). 다중 사용자 기능 설계할 때
- [11-first-product-direction](docs/foundations/11-first-product-direction.md): 첫 제품이 누구를 위한 무엇인지, 화면 우선순위·MVP 스코프
- [12-engine-completion-criteria](docs/foundations/12-engine-completion-criteria.md): 엔진 완성 판정 기준과 측정 방법

## 3. 제품 설계: 지금 스코프에서 어떤 화면과 흐름이 되는가

- [functional-spec/README](docs/blueprints/first-product/functional-spec/README.md): 기능 명세서 전체 개요와 플로우별 범위. 어느 플로우 문서를 봐야 할지 헷갈릴 때
- [workspace-account-flow](docs/blueprints/first-product/functional-spec/workspace-account-flow.md): 로그인·Space·계정 흐름
- [intake-flow](docs/blueprints/first-product/functional-spec/intake-flow.md): 넣기 흐름
- [review-flow](docs/blueprints/first-product/functional-spec/review-flow.md): 리뷰·후처리 흐름
- [browsing-flow](docs/blueprints/first-product/functional-spec/browsing-flow.md): 둘러보기 흐름
- [retrieval-flow](docs/blueprints/first-product/functional-spec/retrieval-flow.md): 꺼내기(묻기·해설) 흐름
- [surface-inventory](docs/blueprints/first-product/surface-inventory.md): MVP 화면 전체 목록과 각 역할. 특정 화면이 뭘 하는지 찾을 때
- [surface-design](docs/blueprints/first-product/surface-design.md): 화면 설계 방법론·원칙·백엔드 빈칸·미룬 것. 새 화면 설계 판단의 근거가 필요할 때
- [product-decisions-log](docs/blueprints/first-product/product-decisions-log.md): 제품 결정 로그
- [design-decisions-log](docs/blueprints/first-product/design-decisions-log.md): 디자인 결정 로그
- [design-reference-log](docs/blueprints/first-product/design-reference-log.md): 디자인 레퍼런스 판단 로그
- [narration-design](docs/blueprints/first-product/narration-design.md): 해설(Narration) 기능 설계
- [mcp-design](docs/blueprints/first-product/mcp-design.md): MCP 레일 설계
- [mcp-tools-design](docs/blueprints/first-product/mcp-tools-design.md): MCP 도구 세트 설계
- [apps/mcp/README](apps/mcp/README.md): MCP 앱 소개

## 4. 엔진 구현 설계: 실제 저장소와 백엔드로 어떻게 앉히는가

- [schema-design](docs/blueprints/save-engine-v2/schema-design.md): 테이블 스키마, RLS, 트리거, 큐/RPC 계약. 마이그레이션 작성 전 확인
- [ingestion-design](docs/blueprints/save-engine-v2/ingestion-design.md): 넣기(원문→진술) 파이프 흐름
- [relation-design](docs/blueprints/save-engine-v2/relation-design.md): 관계 엔진 골격, 관계 종류별 동작 규칙
- [retrieval-design](docs/blueprints/save-engine-v2/retrieval-design.md): 꺼내기 흐름, 뜻 단위 검색
- [auto-scoping-design](docs/blueprints/save-engine-v2/auto-scoping-design.md): 검색 2단계 스코핑(coarse→fine)
- [intervention-design](docs/blueprints/save-engine-v2/intervention-design.md): 사람 개입 3동작(archive·revert·관계 해소)
- [topic-substrate-design](docs/blueprints/save-engine-v2/topic-substrate-design.md): 주제(Topic) 정의와 생애주기
- [temporal-query-design](docs/blueprints/save-engine-v2/temporal-query-design.md): 시간 질의 처리
- [long-input-chunking](docs/blueprints/save-engine-v2/long-input-chunking.md): 초장문 청크 분할
- [eval-design](docs/blueprints/save-engine-v2/eval-design.md): 엔진 품질 측정 방식, 평가셋
- [eval/model-comparison-log](apps/server/src/eval/model-comparison-log.md): 모델 가성비 비교 측정 일지
- [eval/narration-measurement-log](apps/server/src/eval/narration-measurement-log.md): 해설 엔진 측정 라운드별 기록
- [eval/relation-engine/measurement-log](apps/server/src/eval/relation-engine/measurement-log.md): 관계 엔진 측정 라운드별 기록

## 5. 작업 방식/컨벤션: 코드를 어떻게 짜고 협업하는가

- [README](README.md): 프로젝트 소개
- [CLAUDE.md](CLAUDE.md): 루트 전역 규칙, 워크플로우
- [apps/server/CLAUDE.md](apps/server/CLAUDE.md): 서버 패키지 규칙
- [apps/web/CLAUDE.md](apps/web/CLAUDE.md): 웹 패키지 규칙
- [supabase/CLAUDE.md](supabase/CLAUDE.md): 슈퍼베이스 패키지 규칙
- [pull_request_template](.github/pull_request_template.md): PR 본문 양식
- [conventions](docs/guides/conventions.md): 전역 코드 컨벤션
- [apps/server/docs/conventions](apps/server/docs/conventions.md): 서버 코드 컨벤션
- [apps/web/docs/conventions](apps/web/docs/conventions.md): 웹 코드 컨벤션
- [apps/web/docs/query-conventions](apps/web/docs/query-conventions.md): tRPC query/mutation 훅 컨벤션
- [glossary](docs/guides/glossary.md): 제품 용어·개념 용어·코드 용어 매핑. 용어 선택이 헷갈릴 때
- [weave-usage](docs/guides/weave-usage.md): 디자인 시스템 사용 가이드
- [doc-writing](docs/guides/doc-writing.md): 내부 문서 글쓰기 기준
- [ux-writing](docs/guides/ux-writing.md): UX 라이팅 톤앤매너
- [llm-model-map](docs/guides/llm-model-map.md): 동작별 LLM 모델 tier 배정
- [infra-upgrade-guide](docs/guides/infra-upgrade-guide.md): 인프라 유료 전환 시점과 방법

## 6. QA/검증: 다 지었다는 걸 어떻게 확인하는가

- [qa-checklist](docs/guides/qa-checklist.md): 기능 개발 진척 추적 체크리스트
- [design-qa-checklist](docs/guides/design-qa-checklist.md): 디자인 폴리싱 라운드 측정 기준
- [harness-scenarios](docs/harness/harness-scenarios.md): /dev 하니스 엔진 검증 시나리오

## 7. 프로젝트 운영: 지금 뭘 왜 하고 있는가

- [q3-2026 OKR](docs/okr/q3-2026.md): 분기 OKR
- [user-acquisition](docs/gtm/user-acquisition.md): 초기 사용자 10명 확보 실행 설계

## 8. PM 오케스트레이션: 슬라이스를 어떻게 굴리는가

- `nema-slice-implementation-workflow`(저장소 밖, `nema-doc/`): 슬라이스 진행 방식, 역할 분담, 결정 로그

## 9. POC/시각자료: 참고용 시각 자료

- [mvp-wireframe](docs/poc/mvp-wireframe.html): 화면별 동작 근거가 담긴 단일 HTML 와이어프레임

## 10. 히스토리: 더 이상 참고하지 않는 이전 세대 문서

- [intake-surface-design](docs/archive/intake-surface-design.archive.md): 넣기 표면 v1 설계
- [put-in-and-pull-out-flow-design-v1](docs/archive/put-in-and-pull-out-flow-design-v1.archive.md): 넣기·꺼내기 흐름 v1 설계
- [save-engine-v1/prd](docs/archive/save-engine-v1/prd.archive.md): 저장 파이프라인 v1(현재는 save-engine-v2로 대체)
- [save-engine-v1/diagram](docs/archive/save-engine-v1/diagram.archive.html): 위 문서의 시각화 자료
- [content-intake-design](docs/archive/content-intake-design.archive.md): 넣기 구현 청사진 v1(v2 Digest 파이프라인으로 대체). mcp-design.md·topic-substrate-design.md가 아직 이 문서를 참조하고 있어, 그 의존이 유효한지 확인할 때
- [memory-page](docs/archive/memory-page.archive.html): 기억 페이지 이전 와이어프레임
- [implementation-vs-model](docs/archive/implementation-vs-model.archive.md): 기존 구현체(v1)와 새 모델(진술) 대조. 결론은 04-concept-context에 흡수됨
- [drafting-criteria](docs/archive/drafting-criteria.archive.md): 초안 다듬기 기준 v1. Digest 생성 프롬프트에 신호·노이즈 판정 원칙을 반영할 때
- [engine-completion-criteria-v1](docs/archive/engine-completion-criteria-v1.archive.md): 엔진 완성 기준 v1(Digest 도입 전 v1 추출 경로 측정)
- [removed-code-inventory](docs/archive/save-engine-v1/removed-code-inventory.archive.md): v1 채팅 세션 삭제 파일 99개 인벤토리(PR #484). v1에 있던 기능이 다시 필요해졌을 때
