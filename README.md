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
- [direnv](https://direnv.net/) — 환경변수 자동 로딩

### 1. 의존성 설치

```bash
pnpm install
```

### 2. direnv 설정

셸 후킹 (최초 1회):

```bash
# zsh
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc

# bash
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
source ~/.bashrc
```

### 3. 환경변수 설정

환경변수는 레포 밖 중앙 디렉토리에서 관리합니다. 워크트리를 여러 개 쓸 때도 한 번만 설정하면 됩니다.

```bash
mkdir -p ~/.config/nema
```

`apps/server/.env.example`과 `apps/web/.env.example`을 참고하여 아래 파일을 생성합니다:

```bash
# ~/.config/nema/server.env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=xxx
NEO4J_URI=bolt+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=xxx
OPENAI_API_KEY=sk-xxx
VOYAGE_API_KEY=pa-xxx
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

```bash
# ~/.config/nema/web.env
VITE_API_URL=http://localhost:3001/trpc
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

각 앱 디렉토리에서 direnv를 허용합니다:

```bash
cd apps/server && direnv allow
cd apps/web && direnv allow
```

### 4. 개발 서버 실행

```bash
pnpm dev          # 서버 + 웹 동시 실행
```

- 서버: http://localhost:3001
- 웹: http://localhost:5173

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
| `pnpm dev` | 개발 서버 실행 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint` | ESLint 실행 |
| `pnpm test` | 테스트 실행 |
| `pnpm format` | Prettier 포맷팅 |
