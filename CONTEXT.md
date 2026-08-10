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
- [11-first-product-direction](docs/foundations/11-first-product-direction.md): 첫 제품이 누구를 위한 무엇인지, 화면 우선순위·MVP 스코프·완성 판정 기준

## 3. 제품 설계: 지금 스코프에서 어떤 화면과 흐름이 되는가

- [functional-spec/README](docs/blueprints/first-product/functional-spec/README.md): 기능 명세서 전체 개요와 플로우별 범위. 어느 플로우 문서를 봐야 할지 헷갈릴 때
- [workspace-account-flow](docs/blueprints/first-product/functional-spec/workspace-account-flow.md): 로그인·Space·계정 흐름
- [intake-flow](docs/blueprints/first-product/functional-spec/intake-flow.md): 넣기 흐름
- [review-flow](docs/blueprints/first-product/functional-spec/review-flow.md): 리뷰·후처리 흐름
- [browsing-flow](docs/blueprints/first-product/functional-spec/browsing-flow.md): 둘러보기 흐름
- [retrieval-flow](docs/blueprints/first-product/functional-spec/retrieval-flow.md): 꺼내기(묻기·해설) 흐름
- [surface-inventory](docs/blueprints/first-product/surface-inventory.md): MVP 화면 전체 목록과 각 역할. 특정 화면이 뭘 하는지 찾을 때
- [surface-design](docs/blueprints/first-product/surface-design.md): 화면 설계 방법론·원칙·백엔드 빈칸·미룬 것. 새 화면 설계 판단의 근거가 필요할 때
- [narration-design](docs/blueprints/first-product/narration-design.md): 해설(Narration) 기능 설계
- [mcp-design](docs/blueprints/first-product/mcp-design.md): MCP 레일 설계
- [mcp-tools-design](docs/blueprints/first-product/mcp-tools-design.md): MCP 도구 세트 설계

## 4. 엔진 설계: 무엇을 어떤 규칙으로 결정하고, 저장소와 백엔드로 어떻게 앉히는가

- [engine/README](docs/blueprints/first-product/engine/README.md): MVP 엔진 동작 규칙의 지도. 07-modeling과 달라지는 대목과 아직 안 정한 것도 여기
- [engine/organizing](docs/blueprints/first-product/engine/organizing.md): 원문이 들어와 다이제스트가 되기까지
- [engine/linking](docs/blueprints/first-product/engine/linking.md): 다이제스트가 이미 쌓인 것과 이어지기까지. 관계 유형별 규칙
- [engine/lifecycle](docs/blueprints/first-product/engine/lifecycle.md): 쌓인 것이 그 뒤로 바뀌고 사라지기까지

## 5. 작업 방식/컨벤션: 코드를 어떻게 짜고 협업하는가

- [README](README.md): 프로젝트 소개
- [CLAUDE.md](CLAUDE.md): 루트 전역 규칙, 워크플로우
- [supabase/CLAUDE.md](supabase/CLAUDE.md): 슈퍼베이스 패키지 규칙
- [legacy/README](legacy/README.md): 이전 세대 구현 지도. 새 구현 전에 대응하는 옛 구현이 있는지 확인할 때
- [pull_request_template](.github/pull_request_template.md): PR 본문 양식
- [conventions](docs/guides/conventions.md): 전역 코드 컨벤션
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

## 7. POC/시각자료: 참고용 시각 자료

- [mvp-wireframe](docs/poc/mvp-wireframe.html): 화면별 동작 근거가 담긴 단일 HTML 와이어프레임

## 8. 히스토리: 더 이상 참고하지 않는 이전 세대 문서

- [intake-surface-design](docs/archive/intake-surface-design.archive.md): 넣기 표면 v1 설계
- [put-in-and-pull-out-flow-design-v1](docs/archive/put-in-and-pull-out-flow-design-v1.archive.md): 넣기·꺼내기 흐름 v1 설계
- [save-engine-v1/prd](docs/archive/save-engine-v1/prd.archive.md): 저장 파이프라인 v1(v2를 거쳐 지금은 engine/organizing·engine/linking으로 대체)
- [save-engine-v1/diagram](docs/archive/save-engine-v1/diagram.archive.html): 위 문서의 시각화 자료
- [content-intake-design](docs/archive/content-intake-design.archive.md): 넣기 구현 청사진 v1(v2 Digest 파이프라인으로 대체). mcp-design.md·topic-substrate-design.md가 아직 이 문서를 참조하고 있어, 그 의존이 유효한지 확인할 때
- [memory-page](docs/archive/memory-page.archive.html): 기억 페이지 이전 와이어프레임
- [implementation-vs-model](docs/archive/implementation-vs-model.archive.md): 기존 구현체(v1)와 새 모델(진술) 대조. 결론은 04-concept-context에 흡수됨
- [drafting-criteria](docs/archive/drafting-criteria.archive.md): 초안 다듬기 기준 v1. Digest 생성 프롬프트에 신호·노이즈 판정 원칙을 반영할 때
- [engine-completion-criteria-v1](docs/archive/engine-completion-criteria-v1.archive.md): 엔진 완성 기준 v1(Digest 도입 전 v1 추출 경로 측정)
- [removed-code-inventory](docs/archive/save-engine-v1/removed-code-inventory.archive.md): v1 채팅 세션 삭제 파일 99개 인벤토리(PR #484). v1에 있던 기능이 다시 필요해졌을 때
- [save-engine-v2/ingestion-design](docs/archive/save-engine-v2/ingestion-design.archive.md): 넣기 설계 v2(engine/organizing으로 대체). engine/organizing이 놓친 세부가 있는지 대조할 때
- [save-engine-v2/relation-design](docs/archive/save-engine-v2/relation-design.archive.md): 관계 설계 v2(engine/linking으로 대체). engine/linking이 놓친 세부가 있는지 대조할 때
- [save-engine-v2/schema-design](docs/archive/save-engine-v2/schema-design.archive.md): 저장 구조 설계 v2(마이그레이션이 새 줄로 시작하며 계약 무효). 옛 스키마가 실제로 어떻게 짜여 있었는지 마이그레이션 히스토리만으로 안 풀릴 때
- [save-engine-v2/intervention-design](docs/archive/save-engine-v2/intervention-design.archive.md): 사람 개입 설계 v2(engine/lifecycle이 대체할 예정, 아직 골격만). engine/lifecycle을 채울 때 초안으로
- [save-engine-v2/retrieval-design](docs/archive/save-engine-v2/retrieval-design.archive.md): 꺼내기 설계 v2(대응 문서 없음). 꺼내기 엔진 설계를 다시 시작할 때
- [save-engine-v2/auto-scoping-design](docs/archive/save-engine-v2/auto-scoping-design.archive.md): 검색 2단계 스코핑 설계 v2(대응 문서 없음). 검색 스코핑 설계를 다시 시작할 때
- [save-engine-v2/temporal-query-design](docs/archive/save-engine-v2/temporal-query-design.archive.md): 시간 질의 설계 v2(대응 문서 없음). 시간 질의 처리를 다시 설계할 때
- [save-engine-v2/topic-substrate-design](docs/archive/save-engine-v2/topic-substrate-design.archive.md): 주제(Topic) 생애주기 설계 v2(대응 문서 없음). 주제 생애주기를 다시 설계할 때
- [save-engine-v2/long-input-chunking](docs/archive/save-engine-v2/long-input-chunking.archive.md): 초장문 분할 설계 v2(대응 문서 없음). 초장문 분할을 다시 붙일 때
- [save-engine-v2/eval-design](docs/archive/save-engine-v2/eval-design.archive.md): 엔진 품질 측정 설계 v2(대응 문서 없음). 엔진 품질 측정 체계를 다시 세울 때
- [12-engine-completion-criteria](docs/archive/12-engine-completion-criteria.archive.md): 엔진 완성 기준 v2(판정 기준은 11-first-product-direction §7로 흡수, 측정 방법은 여기 남음). v2 시절 수치 측정 경로의 원문이 필요할 때
