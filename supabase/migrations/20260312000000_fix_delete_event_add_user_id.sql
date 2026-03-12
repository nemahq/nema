-- Fix: add optional p_user_id to delete_document_with_event for consistency
-- with create/update functions (also enables service-role testing)

create or replace function delete_document_with_event(
  p_doc_id   uuid,
  p_user_id  uuid default null
)
returns void as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(p_user_id, auth.uid());

  if not exists (
    select 1 from documents where id = p_doc_id and user_id = v_uid
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
