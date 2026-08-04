# 인프라 유료 전환 가이드

현재 staging 환경은 무료 티어를 최대한 활용하는 구조로 운영 중이다. 서비스 성장에 따라 유료 전환이 필요한 시점과 방법을 정리한다.

## 현재 구조 요약

| 서비스 | 현재 상태 | 공유 여부 |
|--------|----------|----------|
| Railway | staging 환경 별도 | 환경 분리 |
| Supabase | staging 프로젝트 별도 (Free Plan) | 프로젝트 분리 |
| Qdrant | 같은 클러스터, 컬렉션 분리 (`statements` / `statements-staging`) | 클러스터 공유 |
| Neo4j Aura | 계정만 존재, 코드 미연결 (미사용) | 해당 없음 |
| OpenAI / Voyage | 같은 API 키 | 공유 |
| Sentry / PostHog | 같은 프로젝트, production만 활성화 | 공유 |

## 서비스별 전환 가이드

### Railway

**전환 시점:** 무료 크레딧($5/월) 소진 시, 또는 더 많은 리소스(메모리, CPU)가 필요할 때.

**방법:**
- Railway 대시보드 → Billing → Pro Plan ($20/월 + 사용량).
- 코드 수정 없음.

### Supabase

**전환 시점:** Free Plan 한도 도달 시 (DB 500MB, Auth MAU 50,000, Storage 1GB).

**방법:**
- Supabase 대시보드 → Organization → Billing → Pro Plan ($25/월/프로젝트).
- production만 유료 전환해도 충분. staging은 Free Plan 유지 가능.
- 코드 수정 없음.

### Qdrant Cloud

로컬 개발은 이 클라우드 클러스터와 무관한 별도 Docker 인스턴스를 쓴다 — `.env.secret`의 키는 staging/production 공유 클러스터 전용이며 로컬에 재사용하지 않는다 (README "로컬 Qdrant 실행" 절 참고).

**전환 시점:** Free Tier 한도 도달 시 (1GB RAM, 0.5 vCPU), 또는 staging/production 완전 격리가 필요할 때.

**방법:**
1. Qdrant Cloud에서 새 클러스터 생성 (Starter: $65/월~).
2. Railway staging 환경 변수 변경:
   - `QDRANT_URL` → 새 클러스터 URL
   - `QDRANT_API_KEY` → 새 클러스터 키
   - `QDRANT_COLLECTION=statements` (staging suffix 제거)
3. 새 클러스터에서 document-sync 워커가 자동으로 컬렉션 생성 + 데이터 재인덱싱.
4. 기존 클러스터의 `statements-staging` 컬렉션은 수동 삭제.
5. 코드 수정 없음.

### Neo4j Aura

계정만 있고 코드(`apps/server`, `apps/mcp`)에는 연결되어 있지 않다 — `neo4j` 참조가 없고 Railway staging/production에도 `NEO4J_*` 변수가 없다. 아래 전환 가이드는 실제로 연동될 경우를 대비한 참고용이며, 지금은 적용 대상이 아니다.

**전환 시점:** Free Tier 한도 도달 시 (200K 노드, 400K 관계), 또는 staging/production 완전 격리가 필요할 때.

**방법:**
1. Neo4j Aura에서 새 인스턴스 생성 (Pro: $65/월~).
2. Railway staging 환경 변수 변경:
   - `NEO4J_URI` → 새 인스턴스 URI
   - `NEO4J_USERNAME` / `NEO4J_PASSWORD` → 새 credentials
3. 기존 인스턴스의 staging 데이터(orphaned)는 user_id로 식별 가능. 정리하지 않아도 production에 영향 없음.
4. 코드 수정 없음.

### OpenAI / Voyage AI

**전환 시점:** 해당 없음. 이미 사용량 기반 과금.

**방법:** API 키를 분리하고 싶으면 별도 프로젝트/조직 생성 후 Railway 환경 변수만 변경.

### Sentry / PostHog

**전환 시점:** Free Plan 한도 도달 시 (Sentry 5K 이벤트/월, PostHog 1M 이벤트/월).

**방법:**
- 각 서비스 대시보드에서 유료 플랜 전환.
- 코드 수정 없음. 환경 변수 변경 없음.

## 전환 우선순위

서비스 성장 시 일반적으로 아래 순서로 한도에 도달한다:

1. **Supabase** — DB 용량이 가장 먼저 찬다
2. **Railway** — 트래픽 증가 시 리소스 부족
3. **Qdrant / Neo4j** — 문서 수 증가 시
4. **Sentry / PostHog** — 이벤트 수 증가 시

모든 서비스는 **코드 수정 없이 환경 변수 변경만으로 전환 가능**하도록 설계되어 있다.
