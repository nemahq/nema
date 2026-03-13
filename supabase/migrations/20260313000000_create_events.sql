-- =============================================================
-- Migration: events (behavioral event tracking)
-- =============================================================

create table events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- =============================================================
-- Indexes
-- =============================================================

create index idx_events_user_created on events (user_id, created_at desc);
create index idx_events_type on events (type);

-- =============================================================
-- RLS: row-level security
-- =============================================================

alter table events enable row level security;

create policy "events_owner" on events
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
