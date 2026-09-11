-- New opt-in source; existing jobs remain native. No ledger data is altered.
alter table public.ar_document_jobs add column statement_source text not null default 'native' check(statement_source in ('native','workspace'));
alter table public.ar_document_jobs add column template_version text;
create table ar_private.statement_templates(hotel text not null check(hotel in ('KAT','TSK')),version text not null,active boolean not null default false,assets jsonb not null,primary key(hotel,version));
create unique index statement_templates_active on ar_private.statement_templates(hotel) where active;
alter table ar_private.statement_templates enable row level security;
revoke all on ar_private.statement_templates from public,anon,authenticated;
create function public.ar_statement_template(p_hotel text,p_version text) returns jsonb language sql security definer set search_path='' as $$ select assets from ar_private.statement_templates where hotel=p_hotel and version=p_version $$;
revoke all on function public.ar_statement_template(text,text) from public,anon,authenticated;
grant execute on function public.ar_statement_template(text,text) to service_role;
create function public.ar_document_create_v2(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare template_id text; payload jsonb; prior ar_private.document_commands; j public.ar_document_jobs; snap jsonb; total numeric; nm text; fp text;
begin
 if p_statement_source is null or p_statement_source not in ('native','workspace') or (p_statement_source='workspace' and p_content='invoices') then raise exception 'document_request_invalid'; end if;
 if p_statement_source='workspace' then select version into template_id from ar_private.statement_templates where hotel=p_hotel and active; if template_id is null then raise exception 'document_statement_template_missing'; end if; end if;
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
   raise exception 'document_owner_denied'; end if;
 if p_command_key is null or p_hotel is null or p_hotel not in ('KAT','TSK') or p_account_id is null or length(p_account_id) not between 1 and 200
   or p_content is null or p_content not in ('statement','invoices','both') or p_layout is null or p_layout not in ('combined','statement_bundle','separate')
   or p_purpose is null or p_purpose not in ('billing','collection') or p_ids is null or array_ndims(p_ids)<>1
   or cardinality(p_ids) not between 1 and 4000 or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v)
   or exists(select 1 from unnest(p_ids) v where v is null or length(v) not between 1 and 200) then raise exception 'document_request_invalid'; end if;
 payload:=jsonb_build_object('hotel',p_hotel,'account_id',p_account_id,'ids',p_ids,'content',p_content,'layout',p_layout,'purpose',p_purpose,'statement_source',p_statement_source,'template_version',template_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into prior from ar_private.document_commands where owner=p_owner and command_key=p_command_key;
 if found then
   if prior.payload<>payload then raise exception 'document_command_conflict'; end if;
   return public.ar_document_get(prior.job_id);
 end if;
 -- Selection order is binding; differently ordered manifests are different work.
 fp:=md5(payload::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||fp,61706));
 -- Coordinate with atomic refresh publication; capture exactly one current selection snapshot.
 perform pg_catalog.pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
 select jsonb_agg(to_jsonb(i) order by ids.ordinal),sum(i.open) into snap,total
 from unnest(p_ids) with ordinality ids(id,ordinal)
 join public.ar_invoices i on i.hotel=p_hotel and i.account_id=p_account_id and i.id=ids.id and i.collection_selectable;
 if snap is null or jsonb_array_length(snap)<>cardinality(p_ids) then raise exception 'document_selection_invalid'; end if;
 select name into nm from public.ar_accounts where hotel=p_hotel and id=p_account_id;
 if not found then raise exception 'document_account_missing'; end if;
 select * into j from public.ar_document_jobs where owner=p_owner and fingerprint=fp and state in ('queued','running','uncertain') for update;
 if found then
   insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
   return public.ar_document_get(j.id);
 end if;
 insert into public.ar_document_jobs(owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,statement_source,template_version)
 values(p_owner,p_command_key,p_hotel,p_account_id,nm,p_ids,p_content,p_layout,p_purpose,fp,snap,total,p_statement_source,template_id) returning * into j;
 if p_content in ('statement','both') then insert into public.ar_document_files(job_id,ordinal,kind) values(j.id,0,'statement'); end if;
 if p_content in ('invoices','both') then
   insert into public.ar_document_files(job_id,ordinal,kind,invoice_id) select j.id,ordinal::integer,'invoice',id from unnest(p_ids) with ordinality ids(id,ordinal);
 end if;
 insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
 return public.ar_document_get(j.id);
end;
$$;
revoke all on function public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text) to service_role;
