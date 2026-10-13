-- Verified current Sheet assertions are separate from immutable mail evidence.
-- No backfill: adoption occurs only inside the validated fresh snapshot path.
create table ar_private.tracker_current_dates(
 hotel text not null,account_id text not null,invoice_id text not null,
 field text not null check(field in('R','U','V','W')),actual_date date,
 region text not null,row_key text not null,history_id bigint not null references ar_private.tracker_history(id),
 generation bigint not null default 1,observed_at timestamptz not null default now(),
 primary key(hotel,account_id,invoice_id,field)
);
alter table ar_private.tracker_current_dates enable row level security;
revoke all on ar_private.tracker_current_dates from public,anon,authenticated,service_role;
alter table ar_private.tracker_outbox add column authority_generation bigint not null default 0;
alter table ar_private.tracker_outbox add column intent_captured boolean not null default false;
alter table ar_private.tracker_outbox add constraint tracker_outbox_authority_generation check(authority_generation>=0);
alter table ar_private.tracker_outbox drop constraint tracker_outbox_state_check;
alter table ar_private.tracker_outbox add constraint tracker_outbox_state_check check(state in('pending','written','conflict','uncertain','held','suppressed'));

create function ar_private.tracker_adopt_current(p_actor uuid,p_region text,p_row text,p_field text,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r ar_private.tracker_rows;c ar_private.tracker_current_dates;h bigint;d date;
begin
 if p_field not in('R','U','V','W') or p_value is null then raise exception 'tracker_authority_invalid';end if;
 d:=(p_value#>>'{}')::date;
 select * into strict r from ar_private.tracker_rows where region=p_region and row_key=p_row and present and account_id is not null and invoice_id is not null;
 select * into c from ar_private.tracker_current_dates where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id and field=p_field for update;
 if c.field is not null and c.actual_date is not distinct from d then return;end if;
 insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,before_value,after_value)
 values(p_region,p_row,p_field,d,'sheet_actual',p_actor,coalesce(to_jsonb(c.actual_date),'null'),p_value) returning id into h;
 insert into ar_private.tracker_current_dates(hotel,account_id,invoice_id,field,actual_date,region,row_key,history_id)
 values(r.hotel,r.account_id,r.invoice_id,p_field,d,p_region,p_row,h)
 on conflict(hotel,account_id,invoice_id,field) do update set actual_date=excluded.actual_date,region=excluded.region,row_key=excluded.row_key,history_id=excluded.history_id,generation=ar_private.tracker_current_dates.generation+1,observed_at=now();
 -- A genuinely new Sent can precede the first ever source observation for a
 -- newly discovered invoice. Bind its frozen generation-zero intent to the
 -- initial blank/equal preimage; historical/bootstrap intents lack this marker.
 if c.field is null then
  update ar_private.tracker_outbox set authority_generation=1,updated_at=now()
  where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id and field=p_field and intent_captured and authority_generation=0 and attempts=0 and state in('pending','held') and (d is null or desired_value=p_value);
 end if;
 -- Native sync reads source before reconciling an attempted unknown write. An
 -- exact echo of that frozen value acknowledges its publication; newer genuine
 -- follow-up intents keep their value and bind to the observed generation.
 if p_region='khao-lak' and p_field in('U','V','W') then
  update ar_private.tracker_outbox sibling set authority_generation=coalesce(c.generation+1,1),updated_at=now()
  where (sibling.hotel,sibling.account_id,sibling.invoice_id,sibling.field)=(r.hotel,r.account_id,r.invoice_id,p_field) and sibling.intent_captured and sibling.attempts=0 and sibling.state in('pending','held') and sibling.authority_generation=coalesce(c.generation,0)
  and exists(select 1 from ar_private.tracker_outbox attempted where (attempted.hotel,attempted.account_id,attempted.invoice_id,attempted.field)=(sibling.hotel,sibling.account_id,sibling.invoice_id,sibling.field) and attempted.state='uncertain' and attempted.authority_generation=coalesce(c.generation,0) and attempted.desired_value=p_value and attempted.created_at<sibling.created_at);
 end if;
 -- Preserve attempted unknown commands for read-only reconciliation. Old
 -- unattempted commands are terminal, including conflicts resolved later.
 update ar_private.tracker_outbox set state='suppressed',updated_at=now()
 where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id and field=p_field and attempts=0 and state in('pending','held','conflict')
 and authority_generation<>coalesce(c.generation+1,1);
end $$;
revoke all on function ar_private.tracker_adopt_current(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;

-- The old floor is only applicable before a Sheet assertion has been adopted.
create or replace function ar_private.tracker_billing_floor(p_hotel text,p_account text,p_invoice text) returns date language sql stable security definer set search_path='' as $$
 select min((e.sent_at at time zone 'Asia/Bangkok')::date)
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft')
 where e.hotel=p_hotel and e.account_id=p_account and p_invoice=any(e.invoice_ids) and e.purpose='billing'
 and not exists(select 1 from ar_private.tracker_current_dates c where c.hotel=p_hotel and c.account_id=p_account and c.invoice_id=p_invoice and c.field='R');
$$;

create or replace function ar_private.tracker_guard_first_billing() returns trigger language plpgsql security definer set search_path='' as $$
declare c ar_private.tracker_current_dates;floor_day date;
begin
 select * into c from ar_private.tracker_current_dates where (hotel,account_id,invoice_id,field)=(new.hotel,new.account_id,new.invoice_id,'R');
 if found then new.first_billing_date:=c.actual_date;
 else
  floor_day:=ar_private.tracker_billing_floor(new.hotel,new.account_id,new.invoice_id);
  if floor_day is not null and (new.first_billing_date is null or new.first_billing_date>floor_day) then new.first_billing_date:=floor_day;end if;
 end if;return new;
end $$;

-- Current mapped Gmail stages disappear only when their own Sheet field exists;
-- Friendly, Final, and custom stages retain their actual-Sent semantics.
create or replace view ar_private.tracker_effective_collection_stage as
 select distinct on(hotel,account_id,invoice_id) hotel,account_id,invoice_id,stage,stage_snapshot,sent_at,source,date_precision
 from(
 select e.hotel,e.account_id,ids.invoice_id,e.stage,e.stage_snapshot,e.sent_at,'gmail_sent'::text as source,'timestamp'::text as date_precision,
 (e.sent_at at time zone 'Asia/Bangkok')::date as actual_day,1 as precision_priority,e.delivery_id::text as event_key,
 (select case when fact->>'revision' ~ '^[0-9]{1,10}$' then (fact->>'revision')::bigint end from jsonb_array_elements(m.snapshot->'workflow') fact where fact->>'invoice_id'=ids.invoice_id and fact->>'hotel'=e.hotel and fact->>'account_id'=e.account_id limit 1) as workflow_revision,0 as stage_position
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft') cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 where e.purpose='collection' and e.sent_at<=clock_timestamp() and ar_private.financial_actor(e.owner)
 and not exists(select 1 from ar_private.tracker_current_dates c where c.hotel=e.hotel and c.account_id=e.account_id and c.invoice_id=ids.invoice_id and c.field=case e.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end)
 union all
 select f.hotel,f.account_id,f.invoice_id,case f.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end,null::jsonb,f.actual_date::timestamp at time zone 'Asia/Bangkok','sheet_actual','day',f.actual_date,0,f.history_id::text,null::bigint,case f.field when 'U' then 1 when 'V' then 2 else 3 end
 from ar_private.tracker_current_dates f where f.field in('U','V','W') and f.actual_date is not null and f.actual_date<=(now() at time zone 'Asia/Bangkok')::date
 union all
 select f.hotel,f.account_id,f.invoice_id,case f.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end,null::jsonb,f.actual_date::timestamp at time zone 'Asia/Bangkok','sheet_actual','day',f.actual_date,0,f.history_id::text,null::bigint,case f.field when 'U' then 1 when 'V' then 2 else 3 end
 from ar_private.tracker_accepted_facts f where f.field in('U','V','W') and f.actual_date is not null and f.actual_date<=(now() at time zone 'Asia/Bangkok')::date
 and not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(f.hotel,f.account_id,f.invoice_id,f.field))
 ) facts order by hotel,account_id,invoice_id,actual_day desc,precision_priority desc,sent_at desc,workflow_revision desc nulls last,stage_position desc,event_key desc;
create or replace view ar_private.tracker_report_current_events as
 select owner,hotel,account_id,invoice_id,kind,sent_at,stage_snapshot,stage_label,terminal_stage,purpose,workflow_revision_before_send,delivery_id,'gmail_sent'::text as source,'timestamp'::text as date_precision
 from ar_private.report_sent_invoices s
 where not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(s.hotel,s.account_id,s.invoice_id) and c.field=case when s.purpose='billing' then 'R' else case s.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end end)
 union all
 select ar_private.access_owner(),f.hotel,f.account_id,f.invoice_id,f.stage,f.sent_at,f.stage_snapshot,replace(f.stage,'Follow ','Follow-up '),false,'collection',null::bigint,null::uuid,f.source,f.date_precision
 from ar_private.tracker_effective_collection_stage f where f.source='sheet_actual'
 union all
 select ar_private.access_owner(),c.hotel,c.account_id,c.invoice_id,'First billing',c.actual_date::timestamp at time zone 'Asia/Bangkok',null::jsonb,'First billing',false,'billing',null::bigint,null::uuid,'sheet_actual','day'
 from ar_private.tracker_current_dates c where c.field='R' and c.actual_date is not null and c.actual_date<=(now() at time zone 'Asia/Bangkok')::date;

-- Snapshot owns workflow application atomically; the legacy fact trigger cannot
-- increment revisions halfway through a validated snapshot.
drop trigger tracker_apply_stage on ar_private.tracker_accepted_facts;

create or replace function ar_private.tracker_sent_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare f text;i text;c ar_private.tracker_current_dates;d date;
begin
 f:=case when new.purpose='billing' then 'R' when new.purpose='collection' then case new.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end end;
 if f is not null then foreach i in array new.invoice_ids loop
  select * into c from ar_private.tracker_current_dates where hotel=new.hotel and account_id=new.account_id and invoice_id=i and field=f;
  d:=case when f='R' then coalesce(c.actual_date,(new.sent_at at time zone 'Asia/Bangkok')::date) else (new.sent_at at time zone 'Asia/Bangkok')::date end;
  if f='R' and c.actual_date is null then
   select least(d,min((q.desired_value#>>'{}')::date)) into d from ar_private.tracker_outbox q
   where (q.owner,q.hotel,q.account_id,q.invoice_id,q.field)=(new.owner,new.hotel,new.account_id,i,f) and q.intent_captured and q.authority_generation=coalesce(c.generation,0) and q.state in('pending','held','uncertain','conflict');
  end if;
  -- A later send is the sole unattempted publication for this mapped field.
  -- Attempted/uncertain work remains independently reconcilable and blocks
  -- native siblings through the existing global uncertain fence.
  update ar_private.tracker_outbox set state='suppressed',updated_at=now()
  where (owner,hotel,account_id,invoice_id,field)=(new.owner,new.hotel,new.account_id,i,f) and attempts=0 and state in('pending','held','conflict');
  insert into ar_private.tracker_outbox(delivery_id,owner,hotel,account_id,invoice_id,field,desired_value,authority_generation,intent_captured,created_at)
  values(new.delivery_id,new.owner,new.hotel,new.account_id,i,f,to_jsonb(d),coalesce(c.generation,0),true,clock_timestamp()) on conflict do nothing;
 end loop;end if;return new;
end $$;
do $$declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.ar_tracker_status(uuid,text)'::regprocedure);
 needle:='from ar_private.tracker_accepted_facts f where f.region=p_region';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_status_drift';end if;
 execute replace(definition,needle,'from ar_private.tracker_current_dates f where f.region=p_region');
end $$;

-- Existing intents retain their historical event date, never the latest send.
update ar_private.tracker_outbox q set desired_value=to_jsonb((e.sent_at at time zone 'Asia/Bangkok')::date)
from public.ar_sent_events e where e.delivery_id=q.delivery_id and q.desired_value is null;

do $migration$
declare definition text;needle text;replacement text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),chr(13),'');
 needle:='coalesce(a.account_no,a.id)=r->>''accountNo''';
 replacement:='(coalesce(a.account_no,a.id)=r->>''accountNo'' or nullif(btrim(r->>''accountNo''),'''') is null and nullif(r->>''invoiceNo'','''') is not null and nullif(r->>''folio'','''') is not null and nullif(r->>''transactionDate'','''') ~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'')';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_identity_drift';end if;definition:=replace(definition,needle,replacement);
 needle:='   if f=''Y'' then';
 if strpos(definition,needle)=0 then needle:=' if f=''Y'' then';end if;
 replacement:=$body$   if f in('R','U','V','W') and r->'fields'?f then
    perform ar_private.tracker_adopt_current(p_actor,p_region,r->>'rowKey',f,sv);
    merged:=merged||jsonb_build_object(f,sv);
    update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(f,sv) where region=p_region and row_key=r->>'rowKey';
    update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=f and status='pending';
    continue;
   end if;
   if f='Y' then$body$;
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_field_drift';end if;definition:=replace(definition,needle,replacement);
 needle:='  bill:=(merged->>''R'')::date;stage:=w.last_reminder_stage;sent:=w.last_reminder_date;';
 if strpos(definition,needle)=0 then needle:=' bill:=(merged->>''R'')::date;stage:=w.last_reminder_stage;sent:=w.last_reminder_date;';end if;
 replacement:=$body$  bill:=(merged->>'R')::date;
  select actual.stage,(actual.sent_at at time zone 'Asia/Bangkok')::date into stage,sent from ar_private.tracker_effective_collection_stage actual where actual.hotel=w.hotel and actual.account_id=a and actual.invoice_id=i;
  vals:=vals||jsonb_build_object('authorityStage',w.last_reminder_stage,'authoritySent',w.last_reminder_date);
  merged:=merged||jsonb_build_object('authorityStage',stage,'authoritySent',sent);$body$;
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_stage_drift';end if;definition:=replace(definition,needle,replacement);
 -- Effective projection already establishes tie order. Remove the old loop
 -- which starts from yesterday's stage and cannot represent a clear.
 needle:=$body$  foreach f in array array['U','V','W'] loop
   day:=(merged->>f)::date;if day is not null and (sent is null or day>sent) then stage:=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;sent:=day;end if;
  end loop;$body$;
 -- Captured production formatting uses one leading space on these three
 -- exact lines. Accept only that known variant; retain the semantic drift gate.
 if strpos(definition,needle)=0 then
  needle:=$body$ foreach f in array array['U','V','W'] loop
 day:=(merged->>f)::date;if day is not null and (sent is null or day>sent) then stage:=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;sent:=day;end if;
 end loop;$body$;
 end if;
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_stage_loop_drift';end if;definition:=replace(definition,needle,'');
 -- Mapped history was recorded exactly once by adoption, including null.
 definition:=replace(definition,'if merged->f is distinct from vals->f then','if f not in(''R'',''U'',''V'',''W'') and merged->f is distinct from vals->f then');
 execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_preview(uuid,text,text,text,text,jsonb)'::regprocedure),chr(13),'');
 needle:='coalesce(src.account_no,src.account_id)=r->>''accountNo''';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_preview_identity_drift';end if;
 execute replace(definition,needle,'(coalesce(src.account_no,src.account_id)=r->>''accountNo'' or nullif(btrim(r->>''accountNo''),'''') is null and nullif(r->>''invoiceNo'','''') is not null and nullif(r->>''folio'','''') is not null and nullif(r->>''transactionDate'','''') ~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'')');

 definition:=replace(pg_get_functiondef('public.ar_tracker_confirm_preview(uuid,text,uuid,text,text)'::regprocedure),chr(13),'');
 needle:=' and exists(select 1 from ar_private.tracker_rows r where r.region=p_region and r.hotel=s.hotel';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_bootstrap_drift';end if;
 definition:=replace(definition,needle,' and not exists(select 1 from ar_private.tracker_current_dates c where c.hotel=s.hotel and c.account_id=s.account_id and c.invoice_id=s.invoice_id and c.field=case when s.purpose=''billing'' then ''R'' when s.stage=''Follow 1'' then ''U'' when s.stage=''Follow 2'' then ''V'' when s.stage=''Follow 3'' then ''W'' end)'||chr(10)||needle);execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure),chr(13),'');
 definition:=replace(definition,'(state=''conflict'' or p_choice=''keep_web'' and state=''written'')','state=''conflict'' and attempts=0 and not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(r.hotel,r.account_id,r.invoice_id,ar_private.tracker_outbox.field))');execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure),chr(13),'');
 needle:='case when p_region=''khao-lak'' and q.state=''uncertain'' then q.desired_value else to_jsonb(case when q.field=''R'' then w.first_billing_date';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_outbox_drift';end if;
 -- Replace the complete dynamic value expression using its unique terminator.
 definition:=regexp_replace(definition,'case when p_region=''khao-lak'' and q.state=''uncertain'' then q.desired_value else to_jsonb\(case when q.field=''R'' then w.first_billing_date.*?end\) end as value','q.desired_value as value','s');
 definition:=replace(definition,'where q.owner=o and','where q.owner=o and (p_region=''khao-lak'' and q.state=''uncertain'' or q.authority_generation=coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0)) and');execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text)'::regprocedure),chr(13),'');
 needle:='if q.state=''written'' then return jsonb_build_object(''state'',''written'');end if;';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_receipt_drift';end if;
 replacement:=needle||$body$
 if q.state='suppressed' then return jsonb_build_object('state','suppressed');end if;
 if q.desired_value is distinct from p_value and not (p_region='khao-lak' and q.state='uncertain' and p_state='uncertain') then raise exception 'tracker_intent_changed';end if;
 if q.state<>'uncertain' and q.authority_generation<>coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0) then
  update ar_private.tracker_outbox set state='suppressed',updated_at=now() where id=q.id;return jsonb_build_object('state','suppressed');
 end if;$body$;
 execute replace(definition,needle,replacement);
end $migration$;

-- Source changes invalidate mutable classifications; historic snapshots remain.
create function ar_private.tracker_capture_authority() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update ar_private.dashboard_daily_invoices snap set billing_required=c.billing_required,credit_term=c.credit_term,first_billing_date=c.first_billing_date,due_date=c.due_date,latest_stage=c.latest_stage,latest_stage_label=c.latest_stage_label,latest_sent_at=c.latest_sent_at
 from ar_private.dashboard_current_invoices c where snap.day=(now() at time zone 'Asia/Bangkok')::date and (snap.hotel,snap.account_id,snap.invoice_id)=(new.hotel,new.account_id,new.invoice_id) and (c.hotel,c.account_id,c.invoice_id)=(snap.hotel,snap.account_id,snap.invoice_id);
 return new;
end $$;
create trigger tracker_capture_authority after update on public.ar_invoice_workflow for each row execute function ar_private.tracker_capture_authority();
revoke all on function ar_private.tracker_capture_authority() from public,anon,authenticated,service_role;
create trigger tracker_authority_invalidate_period after insert or update on ar_private.tracker_current_dates for each statement execute function ar_private.invalidate_period_summaries();

-- An exact provider readback may publish a new frozen intent immediately. A
-- readback for an older attempted generation records evidence only.
create function ar_private.tracker_publish_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare q ar_private.tracker_outbox;c ar_private.tracker_current_dates;s ar_private.tracker_effective_collection_stage;w public.ar_invoice_workflow;
begin
 if new.source<>'confirmed_sent_writeback' then return new;end if;
 select * into strict q from ar_private.tracker_outbox where delivery_id=new.delivery_id and invoice_id=new.invoice_id and field=new.field;
 select * into c from ar_private.tracker_current_dates where (hotel,account_id,invoice_id,field)=(new.hotel,new.account_id,new.invoice_id,new.field) for update;
 if q.authority_generation<>coalesce(c.generation,0) then return new;end if;
 if c.field is null or c.actual_date is distinct from new.actual_date then
  insert into ar_private.tracker_current_dates(hotel,account_id,invoice_id,field,actual_date,region,row_key,history_id)
  values(new.hotel,new.account_id,new.invoice_id,new.field,new.actual_date,new.region,new.row_key,new.id)
  on conflict(hotel,account_id,invoice_id,field) do update set actual_date=excluded.actual_date,region=excluded.region,row_key=excluded.row_key,history_id=excluded.history_id,generation=ar_private.tracker_current_dates.generation+1,observed_at=now();
  -- A newer genuine follow-up queued during an older attempted publication
  -- stays frozen and adopts the published preimage generation. R retains its
  -- first-billing semantics rather than overwriting with a later rebill day.
  update ar_private.tracker_outbox sibling set authority_generation=coalesce(c.generation+1,1),updated_at=now()
  where (hotel,account_id,invoice_id,field)=(new.hotel,new.account_id,new.invoice_id,new.field) and id<>q.id and intent_captured and new.field in('U','V','W') and created_at>q.created_at and attempts=0 and state in('pending','held') and authority_generation=q.authority_generation;
  update ar_private.tracker_outbox set state='suppressed',updated_at=now() where (hotel,account_id,invoice_id,field)=(new.hotel,new.account_id,new.invoice_id,new.field) and id<>q.id and attempts=0 and state in('pending','held','conflict') and authority_generation<>coalesce(c.generation+1,1);
 end if;
 select * into w from public.ar_invoice_workflow where (hotel,account_id,invoice_id)=(new.hotel,new.account_id,new.invoice_id) for update;
 select * into s from ar_private.tracker_effective_collection_stage where (hotel,account_id,invoice_id)=(new.hotel,new.account_id,new.invoice_id);
 update public.ar_invoice_workflow set first_billing_date=case when new.field='R' then new.actual_date else first_billing_date end,
 last_reminder_stage=s.stage,last_reminder_date=(s.sent_at at time zone 'Asia/Bangkok')::date,last_reminder_stage_snapshot=s.stage_snapshot,last_reminder_policy_version=(s.stage_snapshot->>'policyVersion')::integer,revision=revision+1,updated_at=now()
 where (hotel,account_id,invoice_id)=(new.hotel,new.account_id,new.invoice_id) and (first_billing_date,last_reminder_stage,last_reminder_date) is distinct from (case when new.field='R' then new.actual_date else first_billing_date end,s.stage,(s.sent_at at time zone 'Asia/Bangkok')::date)
 returning * into w;
 if found then insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(w.hotel,w.account_id,w.invoice_id,w.revision,new.actor,to_jsonb(w)||jsonb_build_object('source','confirmed_sent_writeback','delivery_id',new.delivery_id));end if;
 return new;
end $$;
create trigger tracker_publish_receipt after insert on ar_private.tracker_history for each row execute function ar_private.tracker_publish_receipt();
revoke all on function ar_private.tracker_publish_receipt() from public,anon,authenticated,service_role;
create function ar_private.tracker_guard_mapped_stage() returns trigger language plpgsql security definer set search_path='' as $$
declare s ar_private.tracker_effective_collection_stage;
begin
 if (new.last_reminder_stage is null or new.last_reminder_stage in('Follow 1','Follow 2','Follow 3')) and exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(new.hotel,new.account_id,new.invoice_id) and c.field in('U','V','W')) then
  select * into s from ar_private.tracker_effective_collection_stage where (hotel,account_id,invoice_id)=(new.hotel,new.account_id,new.invoice_id);
  new.last_reminder_stage:=s.stage;new.last_reminder_date:=(s.sent_at at time zone 'Asia/Bangkok')::date;
  new.last_reminder_stage_snapshot:=s.stage_snapshot;new.last_reminder_policy_version:=(s.stage_snapshot->>'policyVersion')::integer;
 end if;return new;
end $$;
-- Runs before the existing policy snapshot trigger.
create trigger aa_tracker_guard_mapped_stage before insert or update of last_reminder_stage,last_reminder_date on public.ar_invoice_workflow for each row execute function ar_private.tracker_guard_mapped_stage();
revoke all on function ar_private.tracker_guard_mapped_stage() from public,anon,authenticated,service_role;
do $$declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text)'::regprocedure);
 needle:='where region=p_region and row_key=r.row_key;';
 if strpos(definition,needle)=0 then raise exception 'tracker_authority_receipt_row_drift';end if;
 execute replace(definition,needle,'where region=p_region and row_key=r.row_key and q.authority_generation=coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0);');
end $$;

