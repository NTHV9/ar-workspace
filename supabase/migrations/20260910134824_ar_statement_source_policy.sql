-- Owner-approved source policy. Keep all historical jobs and command receipts.
alter function public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text)
 set schema ar_private;
alter function ar_private.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text)
 rename to document_create_before_source_policy;
revoke all on function ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)
 from public,anon,authenticated,service_role;

create function public.ar_document_create_v2(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_content in ('statement','both') then
  if p_statement_source is distinct from 'workspace' then raise exception 'document_statement_source_retired'; end if;
  if cardinality(p_ids)>500 then raise exception 'document_request_invalid'; end if;
 elsif p_content='invoices' and p_statement_source is distinct from 'native' then
  raise exception 'document_request_invalid';
 end if;
 return ar_private.document_create_before_source_policy(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
end $$;
revoke all on function public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text) to service_role;

-- Older backend callers cannot create new native Statements either.
create or replace function public.ar_document_create(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text)
returns jsonb language sql security definer set search_path='' as $$
 select public.ar_document_create_v2(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,case when p_content='invoices' then 'native' else 'workspace' end)
$$;
revoke all on function public.ar_document_create(uuid,uuid,text,text,text[],text,text,text) from public,anon,authenticated;
grant execute on function public.ar_document_create(uuid,uuid,text,text,text[],text,text,text) to service_role;
