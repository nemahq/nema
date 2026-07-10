<p align="center">
  <img src="apps/web/src/assets/nema-logo.svg" alt="Nema" height="32" />
</p>

<p align="center">
  <b>맥락을 구조화하고, 쓸수록 판단이 선명해지는 지식 시스템</b><br>
  <sub><em>A knowledge system that structures your context and sharpens your judgment over time.</em></sub>
</p>


## Stack

| | |
|---|---|
| Monorepo | Turborepo + pnpm |
| Frontend | React 19, Vite 6, TanStack Router/Query, Tailwind CSS 4 |
| Backend | Fastify 5, tRPC 11 |
| Database | Supabase (PostgreSQL + Auth) |
| Vector DB | Qdrant |
| LLM / Embedding | OpenAI, Voyage AI |


## 프로젝트 구조

```
apps/
├── server/       # Fastify + tRPC 백엔드
└── web/          # React + Vite 프론트엔드
packages/
├── shared/       # 공유 스키마, 타입
└── weave/        # UI 컴포넌트, 디자인 토큰
```


## 시작하기

### 사전 요구사항

- Node.js >= 22
- pnpm 10.6+
- [direnv](https://direnv.net/) — 서버 환경변수 자동 로딩 (서버 개발 시 필요)
- Docker — DB 마이그레이션 및 타입 생성 시 필요 ([Docker Desktop](https://docs.docker.com/desktop/) 또는 [Colima](https://github.com/abiosoft/colima))

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경변수

공개 값(Supabase URL, anon key 등)은 각 앱의 `.env`에 커밋되어 있습니다.
**웹 프론트엔드만 작업**한다면 추가 설정 없이 바로 시작할 수 있습니다.

**서버 개발 시** 비밀키를 별도 설정해야 합니다:

```bash
# direnv 셸 후킹 (최초 1회)
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc && source ~/.zshrc

# 비밀키 파일 생성
mkdir -p ~/.config/nema
cp apps/server/.env.example ~/.config/nema/server.env
# ~/.config/nema/server.env 를 열어 실제 값으로 채우기

# direnv 허용
cd apps/server && direnv allow
```

`apps/server/.env.example`에 필요한 비밀키 목록이 있습니다.

### 3. 개발 서버 실행

```bash
pnpm dev          # 웹 + 서버 (local API, staging Supabase)
```

- 웹: http://localhost:5173
- 서버: http://localhost:3001

### 4. 로컬 Supabase로 전체 스택 실행 (선택)

원격 staging Supabase 대신 로컬 Supabase(Auth 포함)에 붙여서 매직링크 로그인까지 로컬에서 검증하려면:

```bash
# Colima 사용 시 (Docker Desktop이 없는 경우)
brew install docker colima
colima start

supabase start -x vector,imgproxy,edge-runtime,logflare,studio
pnpm dev:local    # 웹 + 서버 (local API, local Supabase)
```

로그인 이메일은 실제 발송되지 않고 Mailpit(http://127.0.0.1:54324)에 쌓입니다. 자세한 내용은 `supabase/CLAUDE.md`의 "로컬 인증" 절을 참고하세요.


## DB 마이그레이션

마이그레이션 파일을 추가하거나 수정한 경우 타입을 재생성해야 합니다.

```bash
# Colima 사용 시 (Docker Desktop이 없는 경우)
brew install docker colima
colima start

# 마이그레이션 적용
supabase start -x vector,imgproxy,edge-runtime,logflare,studio
supabase db reset

# 타입 생성 (버전 고정 + 포맷 스크립트 — supabase gen types를 직접 실행하지 말 것)
pnpm supabase:gen-types
supabase stop
```

생성된 `database.types.ts`를 마이그레이션과 함께 커밋합니다. CI에서 드리프트 감지가 동작하므로 타입이 최신이 아니면 머지가 차단됩니다.


## 스크립트

| 명령어 | 설명 |
| --- | --- |
| `pnpm dev` | 웹 + 서버 (local API, staging Supabase) |
| `pnpm dev:local` | 웹 + 서버 (local API, local Supabase) |
| `pnpm dev:web` | 웹만 (staging API) |
| `pnpm dev:web:prod` | 웹만 (prod API) |
| `pnpm dev:server` | 서버만 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint` | ESLint 실행 |
| `pnpm test` | 테스트 실행 |
| `pnpm format` | Prettier 포맷팅 |
