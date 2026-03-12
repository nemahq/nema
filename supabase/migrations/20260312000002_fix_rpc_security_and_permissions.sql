-- =============================================================
-- Fix: search_path, delete overload, auth bypass, anon access
-- =============================================================

-- Drop the old single-arg overload (first migration created (uuid),
-- second migration created (uuid, uuid) as a separate overload)
drop function if exists delete_document_with_event(uuid);

-- =============================================================
-- Re-create all functions with SET search_path
-- =============================================================

-- Business: create_document_with_event
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
$$ language plpgsql security definer set search_path = public, pgmq;

-- Business: update_document_with_event
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
$$ language plpgsql security definer set search_path = public, pgmq;

-- Business: delete_document_with_event (fixed: auth check + single overload)
create or replace function delete_document_with_event(
  p_doc_id   uuid,
  p_user_id  uuid
)
returns void as $$
begin
  if p_user_id != auth.uid() then
    raise exception 'user_id mismatch';
  end if;

  if not exists (
    select 1 from documents where id = p_doc_id and user_id = p_user_id
  ) then
    raise exception 'document not found or not owned by user';
  end if;

  perform pgmq.send('document_sync', jsonb_build_object(
    'type',   'document.deleted',
    'docId',  p_doc_id
  ));

  delete from documents where id = p_doc_id;
end;
$$ language plpgsql security definer set search_path = public, pgmq;

-- Worker: read_sync_events
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
$$ language plpgsql security definer set search_path = public, pgmq;

-- Worker: ack_sync_event
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
$$ language plpgsql security definer set search_path = public, pgmq;

-- Worker: nack_sync_event
create or replace function nack_sync_event(
  p_msg_id bigint,
  p_doc_id uuid default null
)
returns void as $$
begin
  perform pgmq.archive('document_sync', p_msg_id);

  if p_doc_id is not null then
    update documents set ingestion_status = 'failed'
    where id = p_doc_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pgmq;

-- =============================================================
-- Permissions: restrict business functions to authenticated only
-- =============================================================

revoke all on function create_document_with_event from public, anon;
grant execute on function create_document_with_event to authenticated;

revoke all on function update_document_with_event from public, anon;
grant execute on function update_document_with_event to authenticated;

revoke all on function delete_document_with_event(uuid, uuid) from public, anon;
grant execute on function delete_document_with_event(uuid, uuid) to authenticated;
