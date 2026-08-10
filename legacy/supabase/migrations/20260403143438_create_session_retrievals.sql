create table session_retrievals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  query       text not null,
  body        text not null,
  documents   jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_session_retrievals_session
  on session_retrievals (session_id, created_at desc);

alter table session_retrievals enable row level security;

create policy "session_retrievals_owner" on session_retrievals
  for all using (
    session_id in (select id from sessions where user_id = auth.uid())
  )
  with check (
    session_id in (select id from sessions where user_id = auth.uid())
  );

create trigger trg_session_retrievals_updated_at
  before update on session_retrievals
  for each row execute function update_updated_at();
