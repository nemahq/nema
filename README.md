# Nema

AI-powered context management web app.

## Tech Stack

- **Monorepo**: Turborepo + pnpm
- **Frontend**: React 19, Vite 6, TanStack Router/Query, Tailwind CSS 4
- **Backend**: Fastify 5, tRPC 11
- **Database**: Supabase (PostgreSQL + Auth)
- **Vector DB**: Qdrant
- **Graph DB**: Neo4j
- **LLM/Embedding**: OpenAI, Voyage AI

## 시작하기

### 사전 요구사항

- Node.js >= 22
- pnpm 10.6+
- [direnv](https://direnv.net/) — 서버 환경변수 자동 로딩 (서버 개발 시 필요)

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
pnpm dev          # 웹 + 서버 (local API)
```

- 웹: http://localhost:5173
- 서버: http://localhost:3001

## 프로젝트 구조

```
apps/
├── server/       # Fastify + tRPC 백엔드
└── web/          # React + Vite 프론트엔드
packages/
└── shared/       # 공유 스키마, 타입
```

## 스크립트

| 명령어 | 설명 |
| --- | --- |
| `pnpm dev` | 웹 + 서버 (local API) |
| `pnpm dev:web` | 웹만 (prod API) |
| `pnpm dev:server` | 서버만 |
| `pnpm dev:prod` | 웹 + 서버 (prod API) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint` | ESLint 실행 |
| `pnpm test` | 테스트 실행 |
| `pnpm format` | Prettier 포맷팅 |
