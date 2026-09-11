-- Preserve the execution location of every existing request. A joined/replayed
-- job never moves queues and can never cause a second native print.
alter table public.ar_document_jobs add column execution_queue text not null default 'refresh' check(execution_queue in('refresh','documents'));
create function ar_private.document_execution_queue() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then if new.execution_queue<>old.execution_queue then raise exception 'document_execution_queue_immutable';end if;return new;end if;
 new.execution_queue:=case when current_setting('ar.document_queue',true)='documents' then 'documents' else 'refresh' end;return new;
end$$;
create trigger document_execution_queue before insert or update of execution_queue on public.ar_document_jobs for each row execute function ar_private.document_execution_queue();
create function public.ar_document_create_v3(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_setting text:=current_setting('ar.document_queue',true);result jsonb;
begin
 perform set_config('ar.document_queue','documents',true);
 result:=public.ar_document_create_v2(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 perform set_config('ar.document_queue',coalesce(previous_setting,''),true);return result;
end$$;
revoke all on function ar_private.document_execution_queue(),public.ar_document_create_v3(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_create_v3(uuid,uuid,text,text,text[],text,text,text,text) to service_role;
