-- =============================================================
-- Migration: PGMQ outbox for multi-store consistency
-- =============================================================

-- Enable pgmq extension (idempotent if already activated via dashboard)
create extension if not exists pgmq;

-- Create the document sync queue
select pgmq.create('document_sync');

-- =============================================================
-- Business RPC functions (called by user-scoped client)
-- SECURITY DEFINER: needed to access pgmq schema
-- =============================================================

create or replace function create_document_with_event(
  p_user_id    uuid,
  p_title      text,
  p_tags       text[],
  p_summary    text,
  p_body       text,
  p_session_id uuid,
  p_entities   jsonb
)
returns uuid as $$
declare
  v_doc_id uuid;
begin
  if p_user_id != auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  insert into documents (user_id, title, tags, summary, body, ingestion_status)
  values (p_user_id, p_title, p_tags, p_summary, p_body, 'pending')
  returning id into v_doc_id;

  insert into session_documents (session_id, document_id)
  values (p_session_id, v_doc_id)
  on conflict do nothing;

  perform pgmq.send('document_sync', jsonb_build_object(
    'type',     'document.created',
    'docId',    v_doc_id,
    'userId',   p_user_id,
    'body',     p_body,
    'tags',     to_jsonb(p_tags),
    'summary',  p_summary,
    'entities', p_entities
  ));

  return v_doc_id;
end;
$$ language plpgsql security definer;

create or replace function update_document_with_event(
  p_doc_id   uuid,
  p_user_id  uuid,
  p_title    text,
  p_tags     text[],
  p_summary  text,
  p_body     text,
  p_entities jsonb
)
returns void as $$
begin
  if p_user_id != auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  update documents
  set title            = p_title,
      tags             = p_tags,
      summary          = p_summary,
      body             = p_body,
      ingestion_status = 'pending'
  where id = p_doc_id and user_id = p_user_id;

  if not found then
    raise exception 'document not found or not owned by user';
  end if;

  perform pgmq.send('document_sync', jsonb_build_object(
    'type',     'document.updated',
    'docId',    p_doc_id,
    'userId',   p_user_id,
    'body',     p_body,
    'tags',     to_jsonb(p_tags),
    'summary',  p_summary,
    'entities', p_entities
  ));
end;
$$ language plpgsql security definer;

create or replace function delete_document_with_event(p_doc_id uuid)
returns void as $$
begin
  -- Verify ownership before proceeding
  if not exists (
    select 1 from documents where id = p_doc_id and user_id = auth.uid()
  ) then
    raise exception 'document not found or not owned by user';
  end if;

  -- Enqueue before delete (row will be gone after)
  perform pgmq.send('document_sync', jsonb_build_object(
    'type',   'document.deleted',
    'docId',  p_doc_id
  ));

  delete from documents where id = p_doc_id;
end;
$$ language plpgsql security definer;

-- =============================================================
-- Worker RPC functions (called by service-role client)
-- =============================================================

create or replace function read_sync_events(
  p_batch_size         int default 5,
  p_visibility_timeout int default 30
)
returns table (msg_id bigint, read_ct int, message jsonb) as $$
begin
  return query
  select r.msg_id, r.read_ct, r.message
  from pgmq.read('document_sync', p_visibility_timeout, p_batch_size) r;
end;
$$ language plpgsql security definer;

create or replace function ack_sync_event(
  p_msg_id bigint,
  p_doc_id uuid default null
)
returns void as $$
begin
  perform pgmq.archive('document_sync', p_msg_id);

  if p_doc_id is not null then
    update documents set ingestion_status = 'completed'
    where id = p_doc_id;
  end if;
end;
$$ language plpgsql security definer;

create or replace function nack_sync_event(
  p_msg_id bigint,
  p_doc_id uuid default null
)
returns void as $$
begin
  -- Archive the message (exceeded max retries)
  perform pgmq.archive('document_sync', p_msg_id);

  if p_doc_id is not null then
    update documents set ingestion_status = 'failed'
    where id = p_doc_id;
  end if;
end;
$$ language plpgsql security definer;

-- =============================================================
-- Permissions: restrict worker functions to service_role
-- =============================================================

revoke all on function read_sync_events from public, anon, authenticated;
grant execute on function read_sync_events to service_role;

revoke all on function ack_sync_event from public, anon, authenticated;
grant execute on function ack_sync_event to service_role;

revoke all on function nack_sync_event from public, anon, authenticated;
grant execute on function nack_sync_event to service_role;
