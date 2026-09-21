-- New preparations use privately stored RTF-derived Invoice assets. Existing
-- jobs and their reviewed files keep their original source/version permanently.
alter table public.ar_document_jobs add column invoice_source text not null default 'native' check(invoice_source in('native','workspace'));
alter table public.ar_document_jobs add column invoice_template_version text;
alter table public.ar_document_jobs add constraint invoice_template_source_valid check((invoice_source='native' and invoice_template_version is null) or (invoice_source='workspace' and invoice_template_version is not null and content in('invoices','both')));
create table ar_private.invoice_templates(hotel text not null check(ar_private.is_supported_hotel(hotel)),version text not null,active boolean not null default false,assets jsonb not null,primary key(hotel,version));
create unique index invoice_templates_active on ar_private.invoice_templates(hotel) where active;
alter table ar_private.invoice_templates enable row level security;
revoke all on ar_private.invoice_templates from public,anon,authenticated,service_role;
create function public.ar_invoice_template(p_hotel text,p_version text) returns jsonb language sql stable security definer set search_path='' as $$select assets from ar_private.invoice_templates where hotel=p_hotel and version=p_version$$;
revoke all on function public.ar_invoice_template(text,text) from public,anon,authenticated;
grant execute on function public.ar_invoice_template(text,text) to service_role;

create function ar_private.document_invoice_source_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.invoice_source,new.invoice_template_version) is distinct from row(old.invoice_source,old.invoice_template_version) then raise exception 'document_invoice_source_immutable';end if;
 return new;
end$$;
create trigger document_invoice_source_guard before update of invoice_source,invoice_template_version on public.ar_document_jobs for each row execute function ar_private.document_invoice_source_guard();
revoke all on function ar_private.document_invoice_source_guard() from public,anon,authenticated,service_role;

-- Patch only the source payload and insertion seam. Keep the currently deployed
-- actor, hotel, selection, refresh locks, and command receipt checks intact.
do $patch$
declare definition text;r record;
begin
 definition:=replace(pg_get_functiondef('ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($n$declare template_id text;$n$,$r$declare template_id text;invoice_template_id text;invoice_source_value text:='native';$r$),
  ($n$ payload:=jsonb_build_object($n$,$r$ if p_content in('invoices','both') and current_setting('ar.invoice_source',true)='workspace' then
  invoice_source_value:='workspace';
  select version into invoice_template_id from ar_private.invoice_templates where hotel=p_hotel and
   case when nullif(current_setting('ar.invoice_template_version',true),'') is not null then version=current_setting('ar.invoice_template_version',true) else active end;
  if invoice_template_id is null then raise exception 'document_invoice_template_missing';end if;
 end if;
 payload:=jsonb_build_object($r$),
  ($n$'template_version',template_id);$n$,$r$'template_version',template_id);
 if invoice_source_value='workspace' then payload:=payload||jsonb_build_object('invoice_source',invoice_source_value,'invoice_template_version',invoice_template_id);end if;$r$),
  ($n$balance_snapshot,statement_source,template_version)$n$,$r$balance_snapshot,statement_source,template_version,invoice_source,invoice_template_version)$r$),
  ($n$fp,snap,total,p_statement_source,template_id)$n$,$r$fp,snap,total,p_statement_source,template_id,invoice_source_value,invoice_template_id)$r$)
 )as edits(needle,replacement)loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>1 then raise exception 'invoice_source_patch_drift';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

create function public.ar_document_create_v5(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_source text:=current_setting('ar.invoice_source',true);previous_version text:=current_setting('ar.invoice_template_version',true);chosen_source text;chosen_version text;result jsonb;
begin
 -- A retry of a pre-cutover command must join its old job instead of printing
 -- again or replacing its reviewed bytes with the new renderer.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select j.invoice_source,j.invoice_template_version into chosen_source,chosen_version from ar_private.document_commands c join public.ar_document_jobs j on j.id=c.job_id where c.owner=p_owner and c.command_key=p_command_key;
 perform set_config('ar.invoice_source',coalesce(chosen_source,'workspace'),true);
 perform set_config('ar.invoice_template_version',coalesce(chosen_version,''),true);
 result:=public.ar_document_create_v4(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 perform set_config('ar.invoice_source',coalesce(previous_source,''),true);
 perform set_config('ar.invoice_template_version',coalesce(previous_version,''),true);
 return result;
end$$;
revoke all on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text) to service_role;
