# v1 코드 삭제 인벤토리 (PR #484)

PR #484가 v1 채팅 세션(Document/Memory/Revision 모델, 채팅형 UI) 코드를 전부 지웠다. 이 문서는 지운 파일 99개를 그룹별로 정리한다. 각 줄은 파일이 뭘 담고 있었는지만 적는다. 코드 전문과 삭제 사유는 PR #484의 각 커밋에 있다.

## 채팅 세션 화면 (features/session/, 58개 파일)

v1 채팅형 세션 UI 전체. 좌측 사이드바에서 세션을 고르고 우측 채팅 패널에서 메시지를 주고받던 화면이다. 채팅형 인터페이스를 다시 만들 때, 특히 스트리밍·탭 분할·단축키 처리 로직을 참고하고 싶을 때 다시 본다.

- `app/pages/SessionPage.tsx`: 세션 화면 최상위 페이지. 사이드바·채팅 패널·컨텍스트 프로바이더를 조립한다.
- `features/session/chatModeConfig.ts`: 채팅 모드(remember/ask)별 아이콘과 placeholder 매핑.
- `components/ActionMessage.tsx`: 사용자 액션(저장 완료 등)을 알리는 메시지 버블.
- `components/AssistantMessage.tsx`: LLM 응답 메시지 버블.
- `components/AutoOpenRetrievalTab.tsx`: 검색 결과가 저장되면 검색 탭을 자동으로 여는 컴포넌트.
- `components/ChatComposer.tsx`: 채팅 입력창. 슬래시 커맨드 메뉴와 연결된다.
- `components/ChatPanel.tsx`: 메시지 목록과 입력창을 담는 채팅 패널 본체.
- `components/ContentPanel.tsx`: 우측 탭 패널. 검색 결과·도움말을 탭으로 전환한다. 단축키와 드래그앤드롭을 지원한다.
- `components/ContentPanelSkeleton.tsx`: ContentPanel 로딩 스켈레톤.
- `components/DeleteSessionDialog.tsx`: 세션 삭제 확인 다이얼로그.
- `components/DraftTabContent.tsx`: 드래프트(정제된 노트) 미리보기 탭 내용.
- `components/DropZoneOverlay.tsx`: 탭 드래그 시 배치 위치(상하좌우·중앙)를 안내하는 오버레이.
- `components/HelpTabContent.tsx`: 단축키 안내 탭 내용.
- `components/markdown-renderer.css`: 마크다운 렌더러 스타일.
- `components/MarkdownRenderer.tsx`: 어시스턴트 응답을 마크다운으로 렌더링.
- `components/MessageList.tsx`: 메시지 목록. 턴(turn) 단위로 묶어 렌더링한다.
- `components/MessageListSkeleton.tsx`: 메시지 목록 로딩 스켈레톤.
- `components/RenameInput.tsx`: 세션 제목 변경 인라인 입력.
- `components/RetrievalMessage.tsx`: 검색 결과 메시지 버블.
- `components/RetrievalTabContent.tsx`: 검색 결과 상세를 보여주는 탭 내용.
- `components/SearchResultsList.tsx`: 검색 결과 문서 목록.
- `components/SessionItem.tsx`: 사이드바 세션 목록의 항목 하나.
- `components/SessionItemMenu.tsx`: 세션 항목의 드롭다운 메뉴(이름 변경·삭제).
- `components/SessionList.tsx`: 사이드바의 전체 세션 목록. 무한 스크롤로 불러온다.
- `components/SessionListSkeleton.tsx`: 세션 목록 로딩 스켈레톤.
- `components/SessionSidebar.tsx`: 세션 사이드바 전체. 새 세션 버튼을 포함한다.
- `components/SettingsMenuItem.tsx`: 사이드바 설정 메뉴 항목.
- `components/StatusIndicator.tsx`: 진행 중/완료 상태를 점으로 표시.
- `components/StatusMessage.tsx`: "생각 중", "답변 중" 같은 상태 메시지 버블.
- `components/StreamErrorMessage.tsx`: 스트리밍 실패 시 재시도 메시지.
- `components/StreamingRetrievalTabContent.tsx`: 검색 스트리밍 중 실시간으로 채워지는 탭 내용.
- `components/UserMenu.tsx`: 사이드바 하단 계정 메뉴.
- `components/UserMessage.tsx`: 사용자가 보낸 메시지 버블. 길면 접힌다.
- `components/writing-cursor.css`: 타이핑 커서 애니메이션 스타일.
- `components/WritingCursor.tsx`: 생성 중임을 보여주는 깜빡이는 커서.
- `constants.ts`: 세션 목록 페이지 크기, 캐시 유지 시간 상수.
- `contexts/ChatLifecycleContext.tsx`: 스트리밍 상태(생성 중·완료·에러)를 트리 전체에 공유.
- `contexts/ContentTabContext.tsx`: 우측 탭(검색·도움말) 열림 상태 관리.
- `contexts/SplitPaneContext.tsx`: 화면 분할 레이아웃 상태 관리.
- `hooks/useCancelDraft.ts`: 드래프트 생성 취소 mutation.
- `hooks/useChatDraft.ts`: 입력창 임시 저장(로컬스토리지) 훅.
- `hooks/useChatMode.ts`: 채팅 모드 전환 훅.
- `hooks/useDeleteSession.ts`: 세션 삭제 mutation.
- `hooks/useDraftTab.tsx`: ContentPanel용 드래프트 탭 정의.
- `hooks/useGenerateTitle.ts`: 세션 제목 자동 생성 mutation.
- `hooks/useHelpTab.tsx`: 도움말 탭 정의.
- `hooks/useMessageListQuery.ts`: 메시지 목록 조회와 낙관적 업데이트.
- `hooks/useRetrievalTabPersist.ts`: 열린 검색 탭을 로컬스토리지에 저장.
- `hooks/useRetrievalTabs.tsx`: 검색 결과 탭 목록 생성.
- `hooks/useRetrievalTabToggle.ts`: 검색 탭 열기·닫기 토글.
- `hooks/useScrollAnchor.ts`: 새 메시지 도착 시 스크롤 위치 유지.
- `hooks/useSessionId.ts`: URL에서 현재 세션 id를 추출.
- `hooks/useSessionList.ts`: 세션 목록 캐시 조작 헬퍼.
- `hooks/useSessionMessages.ts`: 서버 메시지와 스트리밍 중 메시지를 합쳐 반환.
- `hooks/useSessionQuery.ts`: 세션 단건 조회.
- `hooks/useSplitLayoutPersist.ts`: 화면 분할 레이아웃을 로컬스토리지에 저장.
- `hooks/useTabPaneReconciliation.ts`: 탭과 분할 영역(pane) 상태 동기화.
- `hooks/useUpdateSession.ts`: 세션 제목 변경 mutation.

## 화면 지원 코드 (14개 파일)

세션 화면이 쓰던 범용 UI 유틸이다. 세션 삭제 후 아무 데서도 안 불려 같이 정리했다. 화면 분할 레이아웃이나 슬래시 커맨드 입력을 다시 만들 때 다시 본다.

- `components/ui/split/index.ts`: split 모듈 공개 API.
- `components/ui/split/ResizeHandle.tsx`: 분할 경계 드래그 핸들. 키보드로도 크기를 조절한다.
- `components/ui/split/SplitContainer.tsx`: 트리 구조로 화면을 재귀 분할하는 컨테이너.
- `components/ui/split/tree-ops.ts`: 분할 트리 조작 함수(리프 추가·삭제, 하이드레이션).
- `components/ui/split/tree-ops.test.ts`: 위 함수 테스트.
- `components/ui/split/types.ts`: 분할 트리 타입 정의.
- `hooks/useBufferedStream.ts`: 스트리밍 텍스트를 프레임 단위로 부드럽게 출력.
- `lib/command/shortcut/formatKey.ts`: 단축키 조합을 화면 표시용 텍스트로 변환.
- `lib/command/slash/commandMap.ts`: 슬래시 커맨드(`/help`) 정의.
- `lib/command/slash/SlashCommandMenu.tsx`: 슬래시 커맨드 자동완성 메뉴.
- `lib/command/slash/types.ts`: 슬래시 커맨드 타입 정의.
- `lib/command/slash/useSlashCommandMenu.ts`: 슬래시 커맨드 입력 처리 훅.
- `utils/platform.ts`: Mac 여부 감지(단축키 표시용).
- `utils/truncate.ts`: 텍스트를 길이 제한으로 자르고 말줄임표를 붙인다.

## Shared 스키마 (5개 파일)

웹과 서버가 같이 쓰던 v1 채팅 데이터 타입이다. v1 채팅 데이터 구조를 다시 확인할 때 본다.

- `packages/shared/src/schemas/chat.ts`: 채팅 모드, 채팅 스트림 입력 스키마.
- `packages/shared/src/schemas/chat-stream.ts`: 스트리밍 이벤트(검색 단계, 검색 결과 문서) 스키마.
- `packages/shared/src/schemas/message.ts`: 메시지 role·type(text/draft/status 등) 스키마.
- `packages/shared/src/schemas/message.test.ts`: 위 스키마 테스트.
- `packages/shared/src/schemas/session.ts`: 세션 요약(제목·생성일) 스키마.

## 서버 채팅 백엔드 (15개 파일)

v1 채팅 세션의 서버 쪽 구현이다. 메시지 스트리밍, 드래프트 생성·편집, 세션 CRUD를 담당했다. LLM 스트리밍 응답 처리나 드래프트 정제 로직을 다시 만들 때 다시 본다.

- `routers/session-router.ts`: 세션 CRUD tRPC 라우터.
- `routers/message-router.ts`: 메시지 전송·스트리밍 tRPC 라우터.
- `services/session-service.ts`: 세션 CRUD 서비스 로직.
- `services/session-service.test.ts`: 위 서비스 테스트.
- `services/message-service.ts`: 메시지 조회 서비스.
- `services/retrieval-service.ts`: 채팅 중 검색 결과 삭제 처리.
- `services/chat/index.ts`: 채팅 서비스 공개 API.
- `services/chat/orchestrator.ts`: 메시지 수신부터 스트리밍 응답까지 전체 흐름 조율.
- `services/chat/drafting.ts`: 사용자 입력을 정제된 드래프트로 만드는 로직. 의미 보존 원칙(감정 표현 제거, 정도·확신 유지)이 여기 있었다.
- `services/chat/drafting.test.ts`: 위 로직 테스트.
- `infra/chat-stream-manager.ts`: 스트리밍 재연결을 위한 이벤트 버퍼 관리.
- `prompts/draft-intent.ts`: 후속 메시지가 드래프트에 추가·교체·모호 중 뭔지 분류하는 프롬프트.
- `prompts/drafting-rules.ts`: 드래프트 본문 정제 규칙(의미 보존 원칙 SSOT).
- `prompts/drafting.ts`: 드래프트 생성 시스템 프롬프트.
- `prompts/session-title.ts`: 세션 제목 자동 생성 프롬프트.

## 죽은 서버 이벤트 트래킹 (v1과 무관, 4개 파일)

v1 채팅과 상관없이 이미 호출부가 없던 서버 이벤트 트래킹 경로다. `sessions` 테이블 FK 때문에 DB 정리 중 같이 발견해서 정리했다. 서버에서 이벤트를 다시 기록하고 싶어질 때 참고하되, 지금은 클라이언트 PostHog가 그 역할을 한다.

- `routers/event-router.ts`: 이벤트 기록 tRPC 라우터.
- `services/event-service.ts`: 이벤트를 PostHog와 DB에 이중 기록하던 서비스.
- `infra/posthog.ts`: 서버 사이드 PostHog 클라이언트.
- `packages/shared/src/schemas/event.ts`: 이벤트 트래킹 입력 스키마.

## Eval 스크립트 (3개 파일)

v1 채팅 드래프팅 품질을 재던 평가 스크립트다. v2에서 원문 정제 품질을 다시 측정하고 싶을 때 시드 데이터 설계를 참고할 만하다.

- `eval/eval-drafting.ts`: 드래프팅 결과를 시드 데이터로 평가하는 스크립트.
- `eval/seed-data.ts`: 평가용 입력 8종(짧은 메모, 다항목 텍스트, 영어, 모호한 입력, 이미 정리된 입력, 감정적 입력, 기술적 내용, 회의록)과 편집 사이클 케이스.
- `eval/statement-engine/run-extraction-consistency.ts`: v1 드래프트로 정제된 노트를 기준으로 추출 일관성을 재는 스크립트.

## 참고: 삭제하지 않고 보존한 것

`apps/server/src/infra/statement-sync/chunking.ts`(`chunkForExtraction`, `countTokens`)는 v1과 무관한 별도 세대의 죽은 코드다. Digest 도입 이전, 원문 body를 직접 청킹해서 추출하던 설계라 지금 파이프라인(Digest 생성 1콜, 추출은 Digest 기반)엔 안 붙어 있다. 삭제하지 않고 `@lintignore` 태그로 보존 사유만 남겼다. Digest 생성 단계에 긴 원문 청킹이 필요해지면 재검토 대상이다.
