-- =============================================================
-- Migration: documents, sessions, session_documents
-- =============================================================

-- Enum for ingestion pipeline status
create type ingestion_status as enum ('pending', 'completed', 'failed');

-- ----- documents -----
create table documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  category   text,
  tags       text[] default '{}',
  summary    text,
  body       text not null,
  ingestion_status ingestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- sessions -----
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  messages   jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  draft      jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- session_documents (join table) -----
create table session_documents (
  session_id  uuid not null references sessions(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (session_id, document_id)
);

-- =============================================================
-- Indexes
-- =============================================================

create index idx_documents_user_created      on documents (user_id, created_at desc);
create index idx_documents_pending           on documents (id) where ingestion_status = 'pending';
create index idx_documents_tags              on documents using gin (tags);
create index idx_sessions_user_updated       on sessions (user_id, updated_at desc);
create index idx_session_documents_document_id on session_documents (document_id);

-- =============================================================
-- RLS: row-level security
-- =============================================================

alter table documents enable row level security;
alter table sessions  enable row level security;
alter table session_documents enable row level security;

-- documents: owner can CRUD
create policy "documents_owner" on documents
  for all using (user_id = auth.uid())
  with check  (user_id = auth.uid());

-- sessions: owner can CRUD
create policy "sessions_owner" on sessions
  for all using (user_id = auth.uid())
  with check  (user_id = auth.uid());

-- session_documents: owner can CRUD (via session + document ownership)
create policy "session_documents_owner" on session_documents
  for all using (
    session_id in (select id from sessions where user_id = auth.uid())
    and document_id in (select id from documents where user_id = auth.uid())
  )
  with check (
    session_id in (select id from sessions where user_id = auth.uid())
    and document_id in (select id from documents where user_id = auth.uid())
  );

-- =============================================================
-- Trigger: auto-update updated_at
-- =============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_documents_updated_at
  before update on documents
  for each row execute function update_updated_at();

create trigger trg_sessions_updated_at
  before update on sessions
  for each row execute function update_updated_at();
