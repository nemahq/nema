# v1 회수 지도 — 철거 코드의 부활 후보 (임시)

> v1 소비자 철거(PR #220)로 지운 코드 중, 넣기·꺼내기 엔진 빌드 때 다시 꺼낼 가치가 있는 것의 목록과 경로. **임시 문서** — 넣기·꺼내기 빌드가 끝나면 삭제한다.
>
> 박제 커밋: `c8a8300` (save-engine-v2, 철거 직전 상태). 꺼내기:
>
> ```bash
> git show c8a8300:apps/server/src/infra/document-sync/worker.ts
> ```

---

## 1. 거의 그대로 부활할 것 (배관 코드)

어차피 v2 계약에 맞춰 수정이 필요하지만, 구조는 그대로 쓴다.

| 박제 경로 | v2에서의 자리 | 수정 포인트 |
|---|---|---|
| `apps/server/src/infra/embedding/` | 진술 임베딩 (Voyage, 설계 §5.3) | 거의 없음 — 클라이언트 래퍼는 내용물 무관 |
| `apps/server/src/infra/vector/` | Qdrant 진술 컬렉션 | payload 교체: 문서→진술, `user_id`→`space_id` (§5.3 payload 명세) |
| `apps/server/src/infra/document-sync/worker.ts` | statement_sync worker 골격 | RPC 이름 교체: `fetch_pending_memories`→`fetch_pending_sources`/`fetch_pending_statements` 류. 폴링 루프·notify 소비(`read_sync_events`/`ack_sync_event`)·graceful shutdown 구조는 동일 |

### 함께 부활할 배선 (worker가 돌아올 때 같은 자리에)

- `apps/server/src/infra/providers.ts` — embedding/vectorStore provider 필드 (철거 시 llm만 남김)
- `apps/server/src/index.ts` — worker 부팅·종료 블록, Qdrant `ensureCollection`
- `apps/server/src/env.ts` — `VOYAGE_API_KEY`, `QDRANT_URL`/`QDRANT_API_KEY`(+both-or-neither refine)
- `apps/server/src/error-mapper.ts` — `EMBEDDING_ERROR`/`VECTOR_STORE_ERROR` 매핑
- `apps/server/package.json` — `voyageai`, `@qdrant/js-client-rest`

## 2. 골격·교훈만 참고할 것

- `apps/server/src/prompts/saving.ts`의 **SPLIT 단계** — 통글을 단위로 쪼개는 프롬프트. v2 추출(진술 절단)의 절단 기준 잡을 때 참고. JUDGMENT/META는 합성 문서 병합 판단이라 폐기.
- `apps/server/src/services/chat/retrieval.ts` — 벡터 검색→부스팅→LLM 합성→빈 결과 처리의 단계 구성. 꺼내기는 진술 기반이라 로직은 새로 쓴다.

## 3. 부활 금지 (모델과 함께 죽음)

| 항목 | 죽은 이유 |
|---|---|
| memories CRUD·revision 이력·히스토리 탭 | 합성 문서 모델 폐기 — 변경 이력은 changesets가 대체 |
| Phase4 전파 재합성 (`document-sync/propagation.ts`) | "저장된 합성 문서를 다시 쓰는" 개념 자체가 v2에 없음 — 합성은 pull 시점 뷰 |
| entity 그물 (추출·해소·그래프·UI) | 09에서 보조로 강등 — 관계는 진술 관계(`statement_relations`) 기반으로 새로 설계 |
| save_jobs 큐 | `sources.extraction_status`로 흡수됨 (schema-design §4.2) |
| SaveQueue UI·저장 버튼·`mod+s` | 넣기 엔진이 새 저장 흐름과 함께 새로 그림 |

## 4. 철거가 남긴 살아있는 휴면 자산 (지우지 않음)

- `ChatStreamEvent`의 search/retrieval 이벤트군 + 스트리밍 retrieval UI(세션 6개 파일) — 서버가 발신하지 않는 휴면 상태로 보존. 꺼내기 엔진이 wire format을 재정의할 당사자.
- `sessions.draft`·draft 생성/취소/intent 확인 흐름 — v1 무관, 동작 중.
- `session_retrievals` 표·렌더링 — 동작 중. 꺼내기 엔진이 다시 채움.

## 5. 인프라 잔존물 정리 (넣기 빌드 때 함께)

- **Qdrant**: v1 문서·entity 컬렉션이 남아 있음 — 진술 컬렉션을 새로 잡을 때 구 컬렉션 삭제.
- **Neo4j**: entity 그래프 데이터가 남아 있음 — 관계 엔진 설계 전까지 방치 가능, 비용만 확인.
