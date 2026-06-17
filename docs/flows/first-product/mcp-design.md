# 콘텐츠 입구 MCP 레이어(Track B): 설계 청사진

> 외부 AI가 nema의 초안 대기 자리에 직접 닿는 입구. 이번 슬라이스는 화물(도구)이 아니라 레일을 깐다. 읽기 도구 하나(`list_topics`)를 proof-of-life로 두고, 통신·인증·호출·배포 파이프라인을 production까지 세워, 이후엔 도구 정의만 추가하면 바로 MCP로 동작하는 상태를 만든다.

대상 슬라이스: NEM-157 Track B (형제 문서 `content-intake-design.md` §5.3 MCP 경계·§6.2 외부 입구 흐름 기준).

이 문서는 구현 청사진이다. 코드는 짜지 않고 설계만 못박는다. 얼어붙은 Track 0 계약 위에 외부 입구 레이어를 얹되, 도구를 늘리지 않고 레일을 production까지 까는 데 집중한다.

---

## 1. 무엇을 짓나

채울 빈칸은 도구 카탈로그가 아니다. 이번 슬라이스가 새로 짓는 것은 "레일" 한 줄이다.

1. 외부 AI 호스트가 붙을 원격 MCP 서버를 세운다(`apps/mcp`).
2. 그 서버가 사람을 OAuth로 인증해 "그 사용자"로 백엔드에 닿는 경로를 깐다.
3. 읽기 도구 `list_topics` 하나로 그 경로가 한 줄로 관통함을 증명한다.
4. 이 레일을 로컬에서 production까지 배포 흐름에 얹어, 다음 도구 추가가 순수 도구 정의 변경만으로 끝나게 한다.

엔진(추출 워커, 관계 판정, `create_source`)도, Track 0 계약(스키마·RPC·tRPC 시그니처)도 한 줄도 깎지 않는다. 전부 순수 추가다.

---

## 2. 합의된 설계 결정 (요약)

**범위 (레일을 깐다, 도구는 하나)**
- 읽기 도구 `list_topics` 하나만 노출한다. 쓰기(`upload_draft`)는 다음 라운드.
- "완료"의 정의: 새 도구 추가가 도구 정의 변경만으로 끝나고, 통신·OAuth·배포·CI는 이미 prod에 서 있는 상태.
- 검증 목표가 이동한다. "초안이 DB에 꽂히는지"(쓰기)가 아니라 "레이어가 토큰을 올바른 사용자로 풀어 그 사람 데이터를 읽어오는지"(읽기). 부작용 없는 첫 증명.

**통신**
- 원격 Streamable HTTP. 옛 SSE는 deprecated라 쓰지 않는다.
- 첫 검증 호스트는 Claude Code(원격 Streamable HTTP 기본 지원). 같은 서버가 향후 ChatGPT·Claude 등 MCP 호스트로 확장된다.

**집 (패키지 위치)**
- 모노레포 안 `apps/mcp` 독립 앱. 별도 레포로 분리하지 않는다.
- 이유: `@nema-io/shared` 스키마와 `apps/server`의 `AppRouter` 타입에 결합되어 있어, 레포를 쪼개면 퍼블리시·복제 비용과 타입 사슬 단절을 당장 치른다.

**백엔드 호출 경로**
- tRPC HTTP 클라이언트로 `apps/server`를 호출한다. 서비스 함수·Supabase RPC 직접 호출은 안 한다.
- `AppRouter` 타입을 import해 end-to-end 타입 안전. 기존 `protectedProcedure` + RLS 인증을 그대로 재사용한다(MCP는 인증 로직을 새로 짜지 않는다).

**인증 (Supabase OAuth 2.1 서버)**
- 인증 방식은 OAuth로 간다. 커스텀 PAT는 만들지 않는다. (프롬프트의 PAT 결정을 검증으로 뒤집은 결과. §3 참조.)
- Supabase가 2025-11 public beta로 낸 OAuth 2.1 서버가 MCP 스펙을 준수한다. 토큰 발급은 Supabase가 하고, 우리 서버는 Protected Resource Server로서 검증만 한다(기존 tRPC 컨텍스트가 그대로 검증).
- 열린 DCR이 아니라 pre-registered 클라이언트. 환경별(staging/prod) 클라이언트 분리.
- `openid` scope는 쓰지 않는다. access token만 필요하고, 그것은 기존 HS256 서명으로 검증되므로 prod 코어 인증을 건드리지 않는다.

**빌드 도구**
- 공식 `@modelcontextprotocol/sdk`(TypeScript). 도구 표면이 하나라 상위 프레임워크의 이점이 거의 없고, 우리가 의존하는 스펙(OAuth PRS·Streamable HTTP)을 일급으로 추적한다.

**어디까지 (production 레일)**
- 로컬 dev에서 staging 백엔드로 증명한 뒤, staging 머지 자동배포 → 태그 배포로 prod까지 레일을 세운다.
- prod에 beta(Supabase OAuth 서버)를 켜는 것을 수용한다(완화책은 §6).

**사람 주권 불변식**
- 읽기 전용이라 `draft.confirm`을 도구로 노출하지 않는다. "MCP는 확정하지 않는다"가 구성상 자명하게 성립한다.

---

## 3. 인증 결정의 근거 (PAT에서 OAuth로 뒤집힘)

프롬프트는 "OAuth는 무겁고 PAT는 가볍다"를 전제로 PAT를 골랐다. 코드와 사실 검증 결과 그 전제가 뒤집혔다.

- Supabase OAuth 2.1 서버가 OAuth 서버를 직접 짓는 가장 무거운 부분을 대신한다(`/.well-known/oauth-authorization-server` 자동 노출, Dynamic Client Registration, PKCE, JWKS).
- 발급 토큰은 표준 Supabase JWT라, 기존 tRPC 컨텍스트(`auth.getUser(token)` + RLS)가 손대지 않고 그대로 검증한다.
- 그래서 공수가 역전된다. PAT는 발급·저장·검증을 우리가 새로 짜야 하지만, OAuth는 발급을 Supabase가 하고 우리는 검증만 한다(이미 됨). 수동 발급 코드가 0이 되고, 첫 사용자 경험도 브라우저 로그인 한 번으로 더 낫다.

결론: 새로 짤 코드가 더 적고 버리는 것도 없으며(양쪽 다 종착점은 Supabase JWT) 최종형 인증으로 바로 간다. 그래서 OAuth 채택.

---

## 4. 데이터 흐름 (이번 슬라이스)

```
Claude Code (MCP 호스트 = OAuth 클라이언트)
  -> 브라우저 OAuth 로그인 (Supabase OAuth 2.1 서버) -> access token (Supabase JWT)
  -> list_topics (도구) 호출
       -> apps/mcp: Bearer <JWT> 실어 tRPC 클라이언트로 호출
            -> apps/server topic.list (protectedProcedure: getUser + RLS)
                 -> 그 사용자의 주제만 반환
  -> Claude Code에 주제 목록 반환
```

이 한 줄이 통신(원격 HTTP)·인증 해소(OAuth -> Supabase JWT -> 사용자/공간)·호출 경로(tRPC) 세 미지수를 부작용 없이 동시에 증명한다.

도구 추가 패턴(다음 도구들의 템플릿):

```
도구 = (입력 스키마는 @nema-io/shared 재사용)
        -> 대응 tRPC 프로시저 호출
        -> 결과 반환
```

다음 라운드의 `upload_draft`는 이 패턴을 복사해 새 초안은 `draft.create`(origin='external'), 기존 지목은 `draft.edit`에 매핑만 하면 된다. 확정(`draft.confirm`)은 도구로 절대 노출하지 않는다.

---

## 5. 만들 / 고칠 것

**새 앱 `apps/mcp` (`@nema-io/mcp`)**
- 서버 부트스트랩: 공식 SDK + Streamable HTTP transport.
- OAuth: Protected Resource Server 메타데이터 노출(Supabase를 인증 서버로 가리킴), 토큰 검증.
- 도구 레지스트리 + `list_topics` 도구(=`topic.list` 매핑).
- tRPC 클라이언트 factory(`AppRouter` 타입, 요청별 `Bearer <JWT>` 주입).
- 환경 설정: 각 환경의 `apps/server` URL, Supabase OAuth 클라이언트 자격.

**인프라 (한 번 세우면 이후 도구는 기존 배포 흐름을 탐)**
- Railway 서비스 두 개: staging(머지 자동배포) + prod(태그 배포).
- Supabase 대시보드: staging·prod 각각 OAuth 서버 활성화 + 클라이언트 pre-register + redirect URI 등록.

**건드리지 않는 것**
- Track 0 계약 전부(스키마·RPC·tRPC). 엔진 전부. `apps/server` 인증 미들웨어(그대로 재사용).

---

## 6. 리스크 / 수용

**공개 엔드포인트가 day one부터 인터넷에 열린다**
- 읽기 전용이지만 OAuth가 앞을 막고(인증된 사용자만) RLS가 그 사용자 데이터로만 좁힌다. 그래서 읽기 전용 공개 노출은 수용 가능.
- pre-registered 클라이언트로 좁혀 아무 MCP 클라이언트나 등록되는 열린 DCR을 피한다.

**prod Supabase OAuth = beta**
- Supabase가 production 사용을 명시적으로 승인했다.
- blast radius가 갇힌다. production hot path(토큰 검증 + RLS)는 beta가 아니라 기존 앱이 쓰는 성숙한 코어 Auth다. beta 표면은 발급·연결 흐름에 한정되어, 거친 모서리의 증상은 "새 클라이언트 연결 이상"이지 "prod 인증 붕괴·데이터 유출"이 아니다.
- beta 세금 둘과 완화: (1) breaking change 가능성(실제 사례: 토큰 엔드포인트 201->200). 표준 클라이언트·주류 호스트가 2xx로 처리하므로 resource server 쪽 영향 미미. (2) OIDC ID 토큰은 RS256 요구. `openid` scope를 쓰지 않아 회피하며, 이로써 prod 코어 인증을 건드리는 유일한 변경을 피한다.

**prod 배포 의존성 (정정)**
- prod MCP 배포는 확정 게이트(Track A)와 독립이다. 확정 UI가 없어도 올라온 초안은 대기 상태로 쌓이고, 기술적 막힘이 없다.
- prod 배포가 실제로 의존하는 것은 (a) 노출할 가치가 있는 도구(쓰기) (b) 인프라(Railway + prod OAuth)뿐이다. 이번엔 (a) 이전이지만, "레일을 미리 깐다"는 목표에 따라 인프라를 먼저 세운다.

---

## 7. 빌드 순서

1. `apps/mcp` 스캐폴드(공식 SDK + Streamable HTTP) + 핸드셰이크 확인.
2. tRPC 클라이언트 factory(`AppRouter` 타입, `Bearer` 주입).
3. staging Supabase OAuth 서버 활성화 + PRS 메타데이터 + 클라이언트 pre-register.
4. `list_topics` 도구 = `topic.list` 매핑.
5. 로컬에서 Claude Code 연결: OAuth 로그인 -> `list_topics` -> staging의 내 주제 확인(레일 증명).
6. staging 머지(자동배포) -> 태그 배포로 prod + prod OAuth 설정.

---

## 8. 자기검산

1. 넣기가 가벼운가: 외부 AI가 도구 호출로 닿고, 사람은 손으로 옮기지 않는다. 이번엔 읽기만이지만 레일이 그 가벼움을 향해 깔린다. 예.
2. 사람 주권을 지키는가: 확정을 도구로 노출하지 않아 MCP는 게이트를 못 넘는다. 읽기 전용이라 구성상 자명. 예.
3. 계약을 재사용하는가: Track 0 스키마·RPC·tRPC·인증 미들웨어를 한 줄도 안 고치고 그 위에 얹는다. 예.
4. 증명 가능한가: 내 토큰으로 `list_topics`를 부르면 내 주제만 나온다. 통신·인증 해소·호출 경로가 한 줄로 검증된다. 예.

---

## 9. 열린 항목 / 스코프 밖

열린 항목(다음 라운드):

- `upload_draft`(쓰기) 인터페이스: 입력(body·title?·topics?·draftId?), 반환은 일반 식별자(딥링크는 Track A 이후).
- 새 초안 생성과 기존 초안 지목(draftId 유무) 선택 규칙.
- 멱등·에러 정밀화. 쓰기 도구가 생길 때 의미를 가진다.

스코프 밖(이번 슬라이스 아님):

- 앱 UI(Track A): 확정 게이트·초안 인박스·토큰/연결 관리 화면.
- OAuth consent UI 다듬기, 다중 사용자 운영, 웹 호스트(ChatGPT 웹·claude.ai 웹) 연결 검증.
- v1 철거.
