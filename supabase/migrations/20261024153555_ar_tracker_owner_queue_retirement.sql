-- Owner-reviewed terminal queue retirement. No provider, financial or Sheet writes.
create table ar_private.tracker_retirement_commands(
 command_id uuid primary key,actor uuid not null,region text not null,ids uuid[] not null,
 request_hash text not null,plan jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table ar_private.tracker_retirement_commands enable row level security;
revoke all on ar_private.tracker_retirement_commands from public,anon,authenticated,service_role;
create function ar_private.tracker_retirement_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'tracker_retirement_immutable';end $$;
create trigger tracker_retirement_immutable before update or delete on ar_private.tracker_retirement_commands for each row execute function ar_private.tracker_retirement_immutable();

create function ar_private.tracker_retirement_exact(p_region text,p_hotel text,p_account text,p_invoice text) returns setof ar_private.tracker_rows
language sql stable security definer set search_path='' as $$
 select r.* from ar_private.tracker_rows r join public.ar_invoices i on (i.hotel,i.account_id,i.id)=(r.hotel,r.account_id,r.invoice_id)
 join public.ar_accounts a on (a.hotel,a.id)=(i.hotel,i.account_id)
 where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(p_hotel,p_account,p_invoice) and r.present
 and r.identity->>'hotel'=i.hotel and r.identity->>'invoiceNo'=i.invoice_no and r.identity->>'folio'=i.folio_no
 and r.identity->>'transactionDate'=i.transaction_date::text
 and (nullif(btrim(r.identity->>'accountNo'),'') is null or r.identity->>'accountNo'=coalesce(a.account_no,a.id))
 and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.field='identity' and c.status='pending');
$$;

create function ar_private.tracker_retirement_plan(p_actor uuid,p_region text,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b ar_private.tracker_bindings;q ar_private.tracker_outbox;i public.ar_invoices;c ar_private.tracker_current_dates;r ar_private.tracker_rows;
 items jsonb:='[]';e jsonb;disposition text;n integer;binding jsonb;counts jsonb;begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_actor,p_region);
 if p_region not in('phuket','khao-lak') or p_ids is null or cardinality(p_ids) not between 1 and 100 or exists(select 1 from unnest(p_ids) v group by v having v is null or count(*)<>1) then raise exception 'tracker_retirement_invalid';end if;
 select * into b from ar_private.tracker_bindings where region=p_region and owner=p_actor;
 if b.region is null or not b.enabled or not b.bootstrap_confirmed or b.last_error is not null or b.version is null or b.last_success_at is null or b.last_success_at<clock_timestamp()-interval '15 minutes' or b.last_success_at>clock_timestamp() then raise exception 'tracker_retirement_source_stale';end if;
 if b.lock_until>clock_timestamp() then raise exception 'tracker_retirement_busy';end if;
 binding:=jsonb_build_object('owner',b.owner,'region',b.region,'fileId',b.file_id,'revision',b.revision,'version',b.version);
 for q in select * from ar_private.tracker_outbox where id=any(p_ids) order by id loop
  if q.owner is distinct from p_actor or not q.hotel=any(ar_private.access_hotels(array[p_region])) or q.state not in('pending','held','uncertain','conflict') or q.field not in('R','U','V','W') then raise exception 'tracker_retirement_ineligible';end if;
  select * into i from public.ar_invoices where (hotel,account_id,id)=(q.hotel,q.account_id,q.invoice_id);
  select * into c from ar_private.tracker_current_dates where (hotel,account_id,invoice_id,field)=(q.hotel,q.account_id,q.invoice_id,q.field);
  select count(*) into n from ar_private.tracker_retirement_exact(p_region,q.hotel,q.account_id,q.invoice_id);
  r:=null;if n=1 then select * into r from ar_private.tracker_retirement_exact(p_region,q.hotel,q.account_id,q.invoice_id);end if;
  disposition:=null;
  if n=1 and c.region=p_region and c.row_key=r.row_key and c.generation>q.authority_generation and r.sheet_values ? q.field and r.sheet_values->q.field=coalesce(to_jsonb(c.actual_date),'null'::jsonb)
   and (q.attempts=0 or p_region='phuket' and q.intent_captured and q.provider_version ~ '^v2:"[!#-~]+"$' and b.version ~ '^v2:"[!#-~]+"$' and length(q.provider_version) between 6 and 505 and length(b.version) between 6 and 505 and q.provider_version<>b.version) then
   disposition:='superseded_sheet_authority';
  elsif q.attempts=0 and i.verification_state in('verified','cleared') and i.open=0 and i.synced_at>=clock_timestamp()-interval '15 minutes' and i.synced_at<=clock_timestamp() then disposition:='cleared_invoice';
  elsif q.attempts=0 and n=0 and i.verification_state='verified' and i.open>0 and i.synced_at>=clock_timestamp()-interval '15 minutes' and i.synced_at<=clock_timestamp() then
   if exists(select 1 from ar_private.tracker_rows other where other.region=p_region and other.hotel=q.hotel and other.present
    and other.identity->>'invoiceNo'=i.invoice_no and other.identity->>'folio'=i.folio_no and other.identity->>'transactionDate'=i.transaction_date::text
    and nullif(btrim(other.identity->>'accountNo'),'') is not null and other.identity->>'accountNo' is distinct from (select coalesce(a.account_no,a.id) from public.ar_accounts a where (a.hotel,a.id)=(q.hotel,q.account_id))) then disposition:='quarantine_identity_mismatch';else disposition:='quarantine_missing_row';end if;
  end if;
  if disposition is null then raise exception 'tracker_retirement_ineligible';end if;
  e:=jsonb_build_object('queue',to_jsonb(q),'invoice',to_jsonb(i),'account',(select to_jsonb(a) from public.ar_accounts a where (a.hotel,a.id)=(q.hotel,q.account_id)),'currentAuthority',to_jsonb(c),'sourceRows',coalesce((select jsonb_agg(to_jsonb(s) order by s.row_key) from ar_private.tracker_rows s where s.region=p_region and s.hotel=q.hotel and (s.account_id=q.account_id and s.invoice_id=q.invoice_id or s.identity->>'invoiceNo'=i.invoice_no and s.identity->>'folio'=i.folio_no and s.identity->>'transactionDate'=i.transaction_date::text)),'[]'));
  items:=items||jsonb_build_array(jsonb_build_object('id',q.id,'hotel',q.hotel,'invoiceNo',i.invoice_no,'field',q.field,'disposition',disposition,'evidence',e));
 end loop;
 if jsonb_array_length(items)<>cardinality(p_ids) then raise exception 'tracker_retirement_ineligible';end if;
 select jsonb_object_agg(k,v) into counts from(select x->>'disposition' k,count(*) v from jsonb_array_elements(items) x group by 1)s;
 return jsonb_build_object('hash',encode(sha256(convert_to(jsonb_build_object('binding',binding,'items',items)::text,'UTF8')),'hex'),'items',items,'counts',counts);
end $$;

create function public.ar_tracker_retirement_preview(p_actor uuid,p_region text,p_ids uuid[]) returns jsonb
language sql security definer set search_path='' as $$ select ar_private.tracker_retirement_plan(p_actor,p_region,p_ids); $$;
create function public.ar_tracker_retirement_apply(p_actor uuid,p_region text,p_command uuid,p_ids uuid[],p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old ar_private.tracker_retirement_commands;plan jsonb;result jsonb;ids uuid[];begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_actor,p_region);
 if p_command is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'tracker_retirement_invalid';end if;
 select array_agg(v order by v) into ids from unnest(p_ids) v;
 perform pg_advisory_xact_lock(hashtextextended(p_command::text,241024));
 select * into old from ar_private.tracker_retirement_commands where command_id=p_command;
 if found then
  if old.actor is distinct from p_actor or old.region is distinct from p_region or old.ids is distinct from ids or old.request_hash is distinct from p_hash then raise exception 'tracker_retirement_command_conflict';end if;
  return old.result;
 end if;
 -- Same lock order as snapshot/write-result: binding before outbox. Never steal a lease.
 perform 1 from ar_private.tracker_bindings where region=p_region for update;
 perform 1 from ar_private.tracker_outbox where id=any(p_ids) order by id for update;
 -- OPERA publication updates accounts before their invoices. Hold compatible
 -- source locks through commit; NOWAIT refuses concurrent publication instead
 -- of waiting in a cross-account order that could deadlock with its traversal.
 begin
  perform 1 from public.ar_accounts a where exists(select 1 from ar_private.tracker_outbox q where q.id=any(p_ids) and (q.hotel,q.account_id)=(a.hotel,a.id)) order by a.hotel,a.id for share of a nowait;
  perform 1 from public.ar_invoices i where exists(select 1 from ar_private.tracker_outbox q where q.id=any(p_ids) and (q.hotel,q.account_id,q.invoice_id)=(i.hotel,i.account_id,i.id)) order by i.hotel,i.account_id,i.id for share of i nowait;
 exception when lock_not_available then raise exception 'tracker_retirement_source_busy';end;
 plan:=ar_private.tracker_retirement_plan(p_actor,p_region,p_ids);
 if plan->>'hash' is distinct from p_hash then raise exception 'tracker_retirement_preview_stale';end if;
 update ar_private.tracker_outbox set state='suppressed',updated_at=clock_timestamp() where id=any(ids);
 result:=jsonb_build_object('commandId',p_command,'hash',p_hash,'counts',plan->'counts','retired',cardinality(ids));
 insert into ar_private.tracker_retirement_commands(command_id,actor,region,ids,request_hash,plan,result) values(p_command,p_actor,p_region,ids,p_hash,plan,result);
 return result;
end $$;

-- Preserve the existing public function identity, attributes and grants.
do $migration$
declare definition text;needle text:='return jsonb_build_object(''region'',p_region';begin
 definition:=pg_get_functiondef('public.ar_tracker_status(uuid,text)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_retirement_status_drift';end if;
 definition:=replace(definition,needle,'return ar_private.tracker_retirement_status(o,p_region)||jsonb_build_object(''region'',p_region');
 execute definition;
end $migration$;
create function ar_private.tracker_retirement_status(p_owner uuid,p_region text) returns jsonb
language sql stable security definer set search_path='' as $$
 with quarantined as (
 select q.id,x->>'hotel' hotel,x->>'invoiceNo' invoice_no,x->>'field' field,case x->>'disposition' when 'quarantine_missing_row' then 'missing_sheet_row' else 'sheet_account_mismatch' end reason
 from ar_private.tracker_retirement_commands cmd cross join lateral jsonb_array_elements(cmd.plan->'items') x
 join ar_private.tracker_outbox q on q.id=(x->>'id')::uuid and q.owner=p_owner and q.state='suppressed'
 where cmd.actor=p_owner and cmd.region=p_region and x->>'disposition' in('quarantine_missing_row','quarantine_identity_mismatch')
 and not ((select count(*) from ar_private.tracker_retirement_exact(p_region,q.hotel,q.account_id,q.invoice_id))=1 and exists(select 1 from ar_private.tracker_retirement_exact(p_region,q.hotel,q.account_id,q.invoice_id) r
 join ar_private.tracker_current_dates c on (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)
 where c.region=p_region and c.row_key=r.row_key and c.generation>0 and r.sheet_values ? q.field and r.sheet_values->q.field=coalesce(to_jsonb(c.actual_date),'null'::jsonb)))
 ),first_rows as(select hotel,invoice_no as "invoiceNo",field,reason from quarantined order by hotel,invoice_no,field,id limit 20)
 select jsonb_build_object('quarantinedWrites',(select count(*) from quarantined),'quarantinedRows',coalesce((select jsonb_agg(to_jsonb(f)) from first_rows f),'[]'),'quarantinedRowsTruncated',(select count(*)>20 from quarantined));
$$;
revoke all on function ar_private.tracker_retirement_immutable(),ar_private.tracker_retirement_exact(text,text,text,text),ar_private.tracker_retirement_plan(uuid,text,uuid[]),ar_private.tracker_retirement_status(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_tracker_retirement_preview(uuid,text,uuid[]),public.ar_tracker_retirement_apply(uuid,text,uuid,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function public.ar_tracker_retirement_preview(uuid,text,uuid[]),public.ar_tracker_retirement_apply(uuid,text,uuid,uuid[],text) to service_role;
