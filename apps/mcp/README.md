# @nema-io/mcp

콘텐츠 입구의 외부 입구(Track B). 외부 AI(Claude Code 등)가 원격 MCP로 nema에 닿는 레이어다. 설계 근거는 `docs/flows/first-product/mcp-design.md`.

이번 슬라이스는 도구를 늘리는 게 아니라 레일을 깐다. 노출 도구는 읽기 하나뿐이다.

- `list_topics` -> tRPC `topic.list`. 사용자의 기존 주제 목록을 읽는다.

새 도구는 `src/tools/list-topics.ts` 형태를 따라 대응 tRPC 프로시저에 매핑하면 된다. 쓰기 도구 `upload_draft`(draft.create/draft.edit)는 다음 라운드. 확정(`draft.confirm`)은 도구로 노출하지 않는다(사람 주권).

## 구조

```
요청 -> requireBearerAuth(토큰 검증: Supabase auth.getUser)
     -> StreamableHTTPServerTransport -> 도구 핸들러
        -> tRPC 클라이언트(Bearer 토큰 전달) -> apps/server (protectedProcedure + RLS)
```

인증은 Supabase OAuth로 위임한다. 이 서버는 Protected Resource Server로서 토큰을 검증(`/.well-known/oauth-protected-resource` 메타데이터 노출 + Bearer 검증)하고, 사용자 토큰을 그대로 tRPC에 실어 보낸다. 사용자/공간 해소는 apps/server의 기존 인증이 한다.

## 로컬 실행

```sh
pnpm --filter @nema-io/mcp dev      # tsx watch, staging 백엔드(기본)
# 또는
pnpm --filter @nema-io/mcp build && pnpm --filter @nema-io/mcp start
```

기동 후 확인:

```sh
curl localhost:3002/health
curl localhost:3002/.well-known/oauth-protected-resource
```

## 환경변수

공개 config는 `.env.{staging,production}`(repo). 시크릿은 두지 않는다. 배포 전용 값은 Railway에 둔다.

| 변수 | 용도 | 기본값 |
| --- | --- | --- |
| `PORT` | 로컬 포트 | `3002` |
| `NEMA_API_URL` | 호출할 apps/server tRPC 베이스 | staging URL |
| `SUPABASE_URL` | 토큰 검증용 Supabase 프로젝트(공개) | 환경별 |
| `SUPABASE_ANON_KEY` | Supabase publishable 키(공개) | 환경별 |
| `MCP_PUBLIC_URL` | 배포된 이 서버의 공개 URL(OAuth resource 식별자) | `http://localhost:3002/mcp` |
| `SUPABASE_OAUTH_ISSUER` | OAuth 서버 issuer | `${SUPABASE_URL}/auth/v1` |

## 마무리에 필요한 사람 단계

코드와 무인 검증(통신, PRS 메타데이터, 인증 게이트, transport)은 끝나 있다. 아래는 계정/배포 권한이 필요해 사람이 해야 한다.

1. Supabase OAuth 서버 활성화(staging 먼저, 이후 production)
   - Authentication > OAuth Server에서 서버를 켠다.
   - 공개 클라이언트(PKCE)를 pre-register한다. 자동 등록(DCR)은 켜지 않는다.
   - 사용할 MCP 호스트의 redirect URI를 등록한다.
   - `openid` scope는 사용하지 않는다(접근 토큰만 필요, 기존 서명 방식 유지).
2. 배포(Railway)
   - apps/mcp 서비스를 생성한다(staging 자동배포 + 태그로 production).
   - `MCP_PUBLIC_URL`을 배포 URL(`https://.../mcp`)로 설정한다. 필요 시 `SUPABASE_OAUTH_ISSUER`도.
3. 연결 + 최종 증명
   - MCP 호스트(예: Claude Code)에 원격 서버 URL을 등록한다(로컬은 `http://localhost:3002/mcp`).
   - 브라우저 OAuth 로그인으로 토큰을 발급받는다.
   - `list_topics`를 호출해 본인 주제가 나오는지 확인한다(유효 토큰 -> 주제 경로).
