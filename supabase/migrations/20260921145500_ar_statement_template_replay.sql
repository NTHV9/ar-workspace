-- A new Statement template must not change the payload of an existing command.
-- Retain old template rows/files; new commands still choose the active version.
do $patch$
declare definition text;needle text:='select version into template_id from ar_private.statement_templates where hotel=p_hotel and active;';
begin
 definition:=replace(pg_get_functiondef('ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)'::regprocedure),E'\r','');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'statement_template_patch_drift';end if;
 definition:=replace(definition,needle,$replacement$select version into template_id from ar_private.statement_templates where hotel=p_hotel and
 case when nullif(current_setting('ar.statement_template_version',true),'') is not null then version=current_setting('ar.statement_template_version',true) else active end;$replacement$);
 execute definition;
end $patch$;

create or replace function public.ar_document_create_v5(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_source text:=current_setting('ar.invoice_source',true);previous_version text:=current_setting('ar.invoice_template_version',true);previous_statement_version text:=current_setting('ar.statement_template_version',true);
 chosen_source text;chosen_version text;chosen_statement_version text;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select j.invoice_source,j.invoice_template_version,j.template_version into chosen_source,chosen_version,chosen_statement_version
 from ar_private.document_commands c join public.ar_document_jobs j on j.id=c.job_id where c.owner=p_owner and c.command_key=p_command_key;
 perform set_config('ar.invoice_source',coalesce(chosen_source,'workspace'),true);
 perform set_config('ar.invoice_template_version',coalesce(chosen_version,''),true);
 perform set_config('ar.statement_template_version',coalesce(chosen_statement_version,''),true);
 result:=public.ar_document_create_v4(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 perform set_config('ar.invoice_source',coalesce(previous_source,''),true);
 perform set_config('ar.invoice_template_version',coalesce(previous_version,''),true);
 perform set_config('ar.statement_template_version',coalesce(previous_statement_version,''),true);
 return result;
end$$;
revoke all on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text) to service_role;
