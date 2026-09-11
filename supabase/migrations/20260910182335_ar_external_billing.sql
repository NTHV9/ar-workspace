-- Explicit staff-recorded billing outside this app. No Gmail/OPERA side effects.
create table ar_private.external_billing_records(
 id uuid primary key,owner uuid not null references auth.users(id),hotel text not null check(hotel in('KAT','TSK')),account_id text not null,
 revision integer not null,details jsonb not null,voided boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table ar_private.external_billing_events(
 command_id uuid primary key,owner uuid not null,record_id uuid not null references ar_private.external_billing_records(id),revision integer not null,
 request jsonb not null,preview jsonb not null,recorded_at timestamptz not null default now(),unique(record_id,revision)
);
create index external_billing_account on ar_private.external_billing_records(hotel,account_id,created_at desc,id);
alter table ar_private.external_billing_records enable row level security;
alter table ar_private.external_billing_events enable row level security;
revoke all on ar_private.external_billing_records,ar_private.external_billing_events from public,anon,authenticated,service_role;
create trigger external_billing_events_immutable before update or delete on ar_private.external_billing_events for each row execute function ar_private.financial_immutable();

create function public.ar_external_billing_preview(p_actor uuid,p_input jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h text;a text;action text;actual date;today date:=(now() at time zone 'Asia/Bangkok')::date;w public.ar_invoice_workflow;r ar_private.external_billing_records;line jsonb;lines jsonb:='[]';result jsonb;total numeric;settings public.ar_account_settings;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'billing_forbidden';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input-array['commandId','action','hotel','accountId','recordId','revision','actualDate','channel','reference','note','amount','lines','reason']<>'{}'::jsonb then raise exception 'billing_invalid';end if;
 if p_input->>'commandId' is null or p_input->>'commandId'!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'billing_invalid';end if;
 h:=p_input->>'hotel';a:=p_input->>'accountId';action:=p_input->>'action';
 if h is null or h not in('KAT','TSK') or a is null or length(a) not between 1 and 200 or action is null or action not in('record','correct','void','restore') then raise exception 'billing_invalid';end if;
 if not exists(select 1 from public.ar_accounts where hotel=h and id=a) then raise exception 'billing_account_missing';end if;
 if action<>'record' then
  if p_input->>'recordId' is null or p_input->>'recordId'!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'billing_invalid';end if;
  select * into r from ar_private.external_billing_records where id=(p_input->>'recordId')::uuid and owner=p_actor and hotel=h and account_id=a;
  if not found then raise exception 'billing_missing';end if;
  if r.revision<>(p_input->>'revision')::integer then raise exception 'billing_revision_conflict';end if;
  if length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 2000 then raise exception 'billing_reason_required';end if;
  if action='restore' and not r.voided or action in('void','correct') and r.voided then raise exception 'billing_state_conflict';end if;
  if p_input?'lines' then raise exception 'billing_invoice_change_forbidden';end if;
  lines:=r.details->'lines';
 else
  if p_input?'recordId' or p_input?'revision' or jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 200 then raise exception 'billing_invalid';end if;
  if (select count(*)<>count(distinct v->>'invoiceId') from jsonb_array_elements(p_input->'lines') v) then raise exception 'billing_invalid';end if;
  select * into settings from public.ar_account_settings where hotel=h and account_id=a;
  if settings.billing_required is distinct from true or settings.credit_term is null then raise exception 'billing_rules_missing';end if;
  if p_input->>'channel' is distinct from (case when settings.billing_method='system' then 'system' else 'external_email' end) then raise exception 'billing_channel_conflict';end if;
 end if;
 if action in('record','correct') then
  if jsonb_typeof(p_input->'actualDate') is distinct from 'string' or p_input->>'actualDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'billing_invalid';end if;
  actual:=(p_input->>'actualDate')::date;if actual>today or to_char(actual,'YYYY-MM-DD')<>p_input->>'actualDate' then raise exception 'billing_invalid_date';end if;
  if p_input->>'channel' is null or p_input->>'channel' not in('system','external_email') or jsonb_typeof(p_input->'reference') is distinct from 'string' or length(btrim(p_input->>'reference')) not between 1 and 1000
   or jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>2000 or p_input->>'reference'~'[[:cntrl:]]' then raise exception 'billing_invalid';end if;
  if not(p_input?'amount') or p_input->'amount'<>'null'::jsonb and (jsonb_typeof(p_input->'amount') is distinct from 'string' or p_input->>'amount'!~'^(0|[1-9][0-9]{0,12})[.][0-9]{2}$') then raise exception 'billing_invalid_amount';end if;
  total:=(p_input->>'amount')::numeric;
 end if;
 if action='record' then
  for line in select v from jsonb_array_elements(p_input->'lines') v order by v->>'invoiceId' loop
   if jsonb_typeof(line) is distinct from 'object' or line-array['invoiceId','revision']<>'{}'::jsonb or jsonb_typeof(line->'invoiceId') is distinct from 'string' or jsonb_typeof(line->'revision') is distinct from 'number' then raise exception 'billing_invalid';end if;
   select * into w from public.ar_invoice_workflow where hotel=h and account_id=a and invoice_id=line->>'invoiceId';
   if not found then raise exception 'billing_invoice_missing';end if;
   if w.revision<>(line->>'revision')::integer then raise exception 'billing_revision_conflict';end if;
   if w.billing_required is distinct from true or w.credit_term is null then raise exception 'billing_rules_missing';end if;
   if not exists(select 1 from public.ar_invoices where hotel=h and account_id=a and id=w.invoice_id and collection_role in('standalone','parent') and verification_state='verified') then raise exception 'billing_source_unverified';end if;
   if w.first_billing_date is not null and actual<w.first_billing_date then raise exception 'billing_earlier_than_first';end if;
   if exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.hotel=h and d.account_id=a and w.invoice_id=any(d.invoice_ids) and m.state<>'sent')
    or exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts d on d.id=g.draft_id where d.hotel=h and d.account_id=a and w.invoice_id=any(d.invoice_ids) and g.state in('creating','created','uncertain') and not exists(select 1 from ar_private.mail_deliveries m where m.draft_id=d.id and m.revision=g.revision and m.state='sent')) then raise exception 'billing_handoff_pending';end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('invoiceId',w.invoice_id,'revision',w.revision,'firstBilling',w.first_billing_date is null,'firstDateBefore',w.first_billing_date,'firstDateAfter',coalesce(w.first_billing_date,actual),'dueBefore',w.due_date,'dueAfter',coalesce(w.first_billing_date,actual)+w.credit_term));
  end loop;
 end if;
 result:=jsonb_build_object('action',action,'hotel',h,'accountId',a,'recordId',case when action='record' then (p_input->>'commandId')::uuid else r.id end,'revision',case when action='record' then 0 else r.revision end,'actualDate',case when action in('void','restore') then r.details->>'actualDate' else to_char(actual,'YYYY-MM-DD') end,'channel',case when action in('void','restore') then r.details->>'channel' else p_input->>'channel' end,'reference',case when action in('void','restore') then r.details->>'reference' else p_input->>'reference' end,'note',case when action in('void','restore') then r.details->>'note' else p_input->>'note' end,'amount',case when action in('void','restore') then r.details->>'amount' else ar_private.financial_money(total) end,'lines',lines,'reason',p_input->>'reason','accountName',case when action='record' then(select name from public.ar_accounts where hotel=h and id=a) else r.details->>'accountName' end,'accountType',case when action='record' then(select type from public.ar_accounts where hotel=h and id=a) else r.details->>'accountType' end,'workflowEffect',case when action='record' then 'Set first billing only where not recorded' else 'Billing/due/reminder history remains unchanged' end);
 return jsonb_build_object('preview',result,'digest',encode(pg_catalog.sha256(convert_to(result::text,'UTF8')),'hex'));
exception when others then if sqlerrm~'^billing_[a-z_]+$' then return jsonb_build_object('error',sqlerrm);end if;raise;
end$$;

create function public.ar_external_billing_save(p_actor uuid,p_input jsonb,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e ar_private.external_billing_events;checked jsonb;preview jsonb;line jsonb;w public.ar_invoice_workflow;saved_id uuid;next_revision integer;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'billing_forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into e from ar_private.external_billing_events where command_id=(p_input->>'commandId')::uuid;
 if found then if e.owner<>p_actor or e.request is distinct from p_input then raise exception 'billing_command_conflict';end if;return jsonb_build_object('recordId',e.record_id,'revision',e.revision,'replayed',true);end if;
 if p_input->>'action'='record' then
  perform 1 from public.ar_account_settings where hotel=p_input->>'hotel' and account_id=p_input->>'accountId' for share;
  perform 1 from public.ar_invoices i where i.hotel=p_input->>'hotel' and i.account_id=p_input->>'accountId' and i.id in(select v->>'invoiceId' from jsonb_array_elements(p_input->'lines') v) order by i.id for share;
  perform 1 from public.ar_invoice_workflow where hotel=p_input->>'hotel' and account_id=p_input->>'accountId' and invoice_id in(select v->>'invoiceId' from jsonb_array_elements(p_input->'lines') v) order by invoice_id for update;
 else
  perform 1 from ar_private.external_billing_records r where r.id=(p_input->>'recordId')::uuid for update;
 end if;
 checked:=public.ar_external_billing_preview(p_actor,p_input);if checked?'error' then return checked;end if;if checked->>'digest' is distinct from p_digest then raise exception 'billing_preview_changed';end if;preview:=checked->'preview';saved_id:=(preview->>'recordId')::uuid;next_revision:=(preview->>'revision')::integer+1;
 if p_input->>'action'='record' then
  insert into ar_private.external_billing_records(id,owner,hotel,account_id,revision,details) values(saved_id,p_actor,preview->>'hotel',preview->>'accountId',next_revision,preview);
  for line in select v from jsonb_array_elements(preview->'lines') v loop
   update public.ar_invoice_workflow set first_billing_date=coalesce(first_billing_date,(preview->>'actualDate')::date),revision=ar_invoice_workflow.revision+1,updated_at=clock_timestamp() where hotel=preview->>'hotel' and account_id=preview->>'accountId' and invoice_id=line->>'invoiceId' returning * into w;
   insert into ar_private.invoice_workflow_history values(w.hotel,w.account_id,w.invoice_id,w.revision,p_actor,to_jsonb(w)||jsonb_build_object('source','external_billing','external_billing_id',saved_id),clock_timestamp());
  end loop;
 else
  update ar_private.external_billing_records set revision=next_revision,details=preview,voided=p_input->>'action'='void',updated_at=clock_timestamp() where external_billing_records.id=saved_id;
 end if;
 insert into ar_private.external_billing_events(command_id,owner,record_id,revision,request,preview) values((p_input->>'commandId')::uuid,p_actor,saved_id,next_revision,p_input,preview);
 return jsonb_build_object('recordId',saved_id,'revision',next_revision,'replayed',false);
exception when others then if sqlerrm~'^billing_[a-z_]+$' then return jsonb_build_object('error',sqlerrm);end if;raise;
end$$;


create function public.ar_external_billing_read(p_actor uuid,p_hotel text default null,p_account text default null,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 50,p_type text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'billing_forbidden';end if;
 if p_hotel is not null and p_hotel not in('KAT','TSK') or p_account is not null and p_hotel is null or p_from>p_to or p_offset<0 or p_limit not between 1 and 200 then raise exception 'billing_invalid';end if;
 with filtered as materialized(select r.*,r.details->>'accountName' as account_name,r.details->>'accountType' as account_type from ar_private.external_billing_records r where r.owner=p_actor and (p_type is null or r.details->>'accountType'=p_type) and (p_hotel is null or r.hotel=p_hotel) and (p_account is null or r.account_id=p_account) and (p_from is null or (r.details->>'actualDate')::date>=p_from) and (p_to is null or (r.details->>'actualDate')::date<=p_to))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from(select * from filtered order by created_at desc,id offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from filtered),
 'summary',jsonb_build_object('records',(select count(*) from filtered where not voided),'invoices',(select coalesce(sum(jsonb_array_length(details->'lines')),0) from filtered where not voided),'firstBillingInvoices',(select count(*) from filtered cross join lateral jsonb_array_elements(details->'lines') l where not voided and (l->>'firstBilling')::boolean),'amount',(select case when count(*) filter(where details->'amount'='null'::jsonb)>0 then null else ar_private.financial_money(coalesce(sum((details->>'amount')::numeric),0)) end from filtered where not voided),'unknownAmounts',(select count(*) from filtered where not voided and details->'amount'='null'::jsonb))) into result;
 return result;
exception when others then if sqlerrm~'^billing_[a-z_]+$' then return jsonb_build_object('error',sqlerrm);end if;raise;
end$$;


revoke all on function public.ar_external_billing_preview(uuid,jsonb),public.ar_external_billing_save(uuid,jsonb,text),public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text) from public,anon,authenticated;
grant execute on function public.ar_external_billing_preview(uuid,jsonb),public.ar_external_billing_save(uuid,jsonb,text),public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text) to service_role;
create function public.ar_external_billing_history(p_actor uuid,p_id uuid,p_offset integer default 0,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','billing_forbidden');end if;
 if not exists(select 1 from ar_private.external_billing_records where id=p_id and owner=p_actor) then return jsonb_build_object('error','billing_missing');end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','billing_invalid');end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x) order by revision desc) from(select revision,preview,recorded_at from ar_private.external_billing_events where record_id=p_id and owner=p_actor order by revision desc offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from ar_private.external_billing_events where record_id=p_id and owner=p_actor));
end$$;
revoke all on function public.ar_external_billing_history(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.ar_external_billing_history(uuid,uuid,integer,integer) to service_role;

-- The external activity projection supplies provenance; do not label its audit copy as a manual correction.
do $migration$
declare definition text;needle text:=$needle$h.details->>'source' is distinct from 'gmail_sent'$needle$;
begin
 definition:=pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'review current account history source projection';end if;
 definition:=replace(definition,needle,needle||$extra$ and h.details->>'source' is distinct from 'external_billing'$extra$);execute definition;
end $migration$;
