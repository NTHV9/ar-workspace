-- Fresh AR-owned integration state. No provider/desktop credentials or source schema.
create index ar_tracker_invoice_lookup on public.ar_invoices(hotel,invoice_no,account_id,folio_no) where invoice_no is not null;
create index ar_tracker_account_lookup on public.ar_accounts(hotel,account_no) where account_no is not null;
create table ar_private.tracker_bindings(
 region text primary key check(region in('phuket','khao-lak')),owner uuid not null,
 file_id text not null check(file_id ~ '^[A-Za-z0-9_-]{20,200}$'),enabled boolean not null default false,bootstrap_confirmed boolean not null default false,
 revision integer not null default 1,version text,last_checked_at timestamptz,last_success_at timestamptz,
 lock_id uuid,lock_until timestamptz,last_error text
);
create table ar_private.tracker_data_revisions(region text primary key check(region in('phuket','khao-lak')),revision bigint not null default 0);
revoke all on ar_private.tracker_data_revisions from public,anon,authenticated,service_role;
create table ar_private.tracker_previews(
 id uuid primary key default gen_random_uuid(),region text not null references ar_private.tracker_bindings(region),actor uuid not null,
 file_id text not null,version text not null,snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),rows jsonb not null,
 status text not null default 'pending' check(status in('pending','confirmed')),created_at timestamptz not null default now(),confirmed_at timestamptz
);
revoke all on ar_private.tracker_previews from public,anon,authenticated,service_role;
create table ar_private.tracker_rows(
 region text not null references ar_private.tracker_bindings(region),row_key text not null,
 hotel text not null,account_id text,invoice_id text,identity jsonb not null,locator jsonb not null,
 sheet_values jsonb not null,baseline jsonb not null default '{}',web_values jsonb not null default '{}',
 observed_at timestamptz not null default now(),present boolean not null default true,
 primary key(region,row_key)
);
create table ar_private.tracker_conflicts(
 id uuid primary key default gen_random_uuid(),region text not null,row_key text not null,field text not null,
 reason text not null,sheet_value jsonb,web_value jsonb,baseline jsonb,status text not null default 'pending' check(status in('pending','resolved')),
 revision integer not null default 1,created_at timestamptz not null default now(),resolved_by uuid,resolved_at timestamptz,
 foreign key(region,row_key) references ar_private.tracker_rows(region,row_key)
);
create unique index tracker_pending_conflict on ar_private.tracker_conflicts(region,row_key,field) where status='pending';
create table ar_private.tracker_history(
 id bigint generated always as identity primary key,region text not null,row_key text not null,field text not null,
 hotel text,account_id text,invoice_id text,
 actual_date date,observed_at timestamptz not null default now(),source text not null,actor uuid,
 source_editor text,source_sender text,
 before_value jsonb,after_value jsonb,delivery_id uuid
);
create table ar_private.tracker_accepted_facts(
 region text not null,row_key text not null,hotel text not null,account_id text not null,invoice_id text not null,field text not null,
 actual_date date,value jsonb,history_id bigint not null references ar_private.tracker_history(id),
 primary key(region,row_key,field)
);
create table ar_private.tracker_workflow_origin(hotel text not null,account_id text not null,invoice_id text not null,revision integer not null,stage_owned boolean not null,primary key(hotel,account_id,invoice_id));
revoke all on ar_private.tracker_workflow_origin from public,anon,authenticated,service_role;
create table ar_private.tracker_reported_status(hotel text not null,account_id text not null,invoice_id text not null,raw text,region text not null,row_key text not null,observed_at timestamptz not null,imported_by uuid,history_id bigint not null references ar_private.tracker_history(id),primary key(hotel,account_id,invoice_id));
revoke all on ar_private.tracker_reported_status from public,anon,authenticated,service_role;
revoke all on ar_private.tracker_accepted_facts from public,anon,authenticated,service_role;
create function ar_private.tracker_history_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select r.hotel,r.account_id,r.invoice_id into new.hotel,new.account_id,new.invoice_id from ar_private.tracker_rows r where r.region=new.region and r.row_key=new.row_key;
 if new.hotel is null or new.account_id is null or new.invoice_id is null then raise exception 'tracker_history_identity_missing';end if;return new;
end $$;
-- A reviewed Sheet assertion can be corrected or retracted, but confirmed
-- billing evidence still establishes the latest possible first billing day.
create function ar_private.tracker_billing_floor(p_hotel text,p_account text,p_invoice text) returns date language sql stable security definer set search_path='' as $$
 select min((e.sent_at at time zone 'Asia/Bangkok')::date) from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft')
 where e.hotel=p_hotel and e.account_id=p_account and p_invoice=any(e.invoice_ids) and e.purpose='billing';
$$;
create function ar_private.tracker_guard_first_billing() returns trigger language plpgsql security definer set search_path='' as $$
declare floor_day date;begin
 floor_day:=ar_private.tracker_billing_floor(new.hotel,new.account_id,new.invoice_id);
 if floor_day is not null and (new.first_billing_date is null or new.first_billing_date>floor_day) then new.first_billing_date:=floor_day;end if;
 return new;
end $$;
create trigger tracker_guard_first_billing before insert or update of first_billing_date on public.ar_invoice_workflow for each row execute function ar_private.tracker_guard_first_billing();
create function ar_private.tracker_confirm_billing_floor() returns trigger language plpgsql security definer set search_path='' as $$
declare event public.ar_sent_events;invoice text;w public.ar_invoice_workflow;floor_day date;begin
 select * into event from public.ar_sent_events where delivery_id=new.id and owner=new.owner and purpose='billing';
 if event.delivery_id is null then return new;end if;
 foreach invoice in array event.invoice_ids loop
  floor_day:=ar_private.tracker_billing_floor(event.hotel,event.account_id,invoice);
  update public.ar_invoice_workflow set first_billing_date=floor_day,revision=revision+1,updated_at=now() where hotel=event.hotel and account_id=event.account_id and invoice_id=invoice and floor_day is not null and (first_billing_date is null or first_billing_date>floor_day) returning * into w;
  if found then insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(w.hotel,w.account_id,w.invoice_id,w.revision,event.owner,to_jsonb(w)||jsonb_build_object('source','confirmed_first_billing_guard','delivery_id',event.delivery_id));end if;
 end loop;return new;
end $$;
create trigger tracker_confirm_billing_floor after update of state on ar_private.mail_deliveries for each row when(old.state is distinct from new.state and new.state='sent') execute function ar_private.tracker_confirm_billing_floor();
revoke all on function ar_private.tracker_billing_floor(text,text,text),ar_private.tracker_guard_first_billing(),ar_private.tracker_confirm_billing_floor() from public,anon,authenticated,service_role;
create trigger tracker_history_identity before insert on ar_private.tracker_history for each row execute function ar_private.tracker_history_identity();
create function ar_private.tracker_history_immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'tracker_history_immutable';end $$;
create trigger tracker_history_immutable before update or delete on ar_private.tracker_history for each row execute function ar_private.tracker_history_immutable();
create function ar_private.tracker_data_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare region_key text;
begin
 if tg_table_name='tracker_history' then region_key:=new.region;
 else region_key:=case when new.hotel in('KAT','TSK') then 'phuket' else 'khao-lak' end;end if;
 -- Revision counters are separate from provider leases: confirmed Sent already
 -- holds workflow locks and must never acquire the binding lock in reverse order.
 insert into ar_private.tracker_data_revisions(region,revision) values(region_key,1) on conflict(region) do update set revision=ar_private.tracker_data_revisions.revision+1;
 return new;
end $$;
create trigger tracker_data_changed after insert on ar_private.tracker_history for each row execute function ar_private.tracker_data_changed();
create trigger tracker_sent_data_changed after insert on public.ar_sent_events for each row execute function ar_private.tracker_data_changed();
create trigger tracker_workflow_data_changed after update of first_billing_date,billing_required,credit_term,last_reminder_stage,last_reminder_date on public.ar_invoice_workflow for each row
 when((old.first_billing_date,old.billing_required,old.credit_term,old.last_reminder_stage,old.last_reminder_date) is distinct from (new.first_billing_date,new.billing_required,new.credit_term,new.last_reminder_stage,new.last_reminder_date)) execute function ar_private.tracker_data_changed();
revoke all on function ar_private.tracker_data_changed() from public,anon,authenticated,service_role;
create function ar_private.tracker_accept_fact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source in('sheet_actual','sheet_actual_reviewed','sheet_reported_status') then
 insert into ar_private.tracker_accepted_facts(region,row_key,hotel,account_id,invoice_id,field,actual_date,value,history_id)
 values(new.region,new.row_key,new.hotel,new.account_id,new.invoice_id,new.field,new.actual_date,new.after_value,new.id)
 on conflict(region,row_key,field) do update set actual_date=excluded.actual_date,value=excluded.value,history_id=excluded.history_id;
 if new.field='Y' then
  insert into ar_private.tracker_reported_status(hotel,account_id,invoice_id,raw,region,row_key,observed_at,imported_by,history_id) values(new.hotel,new.account_id,new.invoice_id,new.after_value#>>'{}',new.region,new.row_key,new.observed_at,new.actor,new.id)
  on conflict(hotel,account_id,invoice_id) do update set raw=excluded.raw,region=excluded.region,row_key=excluded.row_key,observed_at=excluded.observed_at,imported_by=excluded.imported_by,history_id=excluded.history_id;
 end if;
 end if;return new;
end $$;
create trigger tracker_accept_fact after insert on ar_private.tracker_history for each row execute function ar_private.tracker_accept_fact();
create trigger tracker_invalidate_period after insert or update on ar_private.tracker_accepted_facts for each statement execute function ar_private.invalidate_period_summaries();
revoke all on function ar_private.tracker_history_identity(),ar_private.tracker_accept_fact(),ar_private.tracker_history_immutable() from public,anon,authenticated,service_role;
create table ar_private.tracker_outbox(
 id uuid primary key default gen_random_uuid(),delivery_id uuid not null references public.ar_sent_events(delivery_id),
 owner uuid not null,hotel text not null,account_id text not null,invoice_id text not null,field text not null check(field in('R','U','V','W')),
 state text not null default 'pending' check(state in('pending','written','conflict','uncertain','held')),attempts integer not null default 0,
 expected_value jsonb,desired_value jsonb,provider_version text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(delivery_id,invoice_id,field)
);
revoke all on ar_private.tracker_bindings,ar_private.tracker_rows,ar_private.tracker_conflicts,ar_private.tracker_history,ar_private.tracker_outbox from public,anon,authenticated,service_role;
create function ar_private.tracker_authorize(p_actor uuid,p_region text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;begin
 m:=ar_private.access_member(p_actor);
 if m.email is null or p_region is null or not p_region=any(m.regions) then raise exception 'tracker_forbidden';end if;
 return ar_private.access_owner();
end $$;
create function ar_private.tracker_sent_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare f text;i text;begin
 -- Sent evidence is inserted before delivery.state and workflow are updated.
 -- Enqueue from NEW in the same transaction; the consumer verifies final state.
 f:=case when new.purpose='billing' then 'R' when new.purpose='collection' then case new.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end end;
 if f is not null then foreach i in array new.invoice_ids loop
 insert into ar_private.tracker_outbox(delivery_id,owner,hotel,account_id,invoice_id,field) values(new.delivery_id,new.owner,new.hotel,new.account_id,i,f) on conflict do nothing;
 end loop;end if;return new;
end $$;
create trigger ar_tracker_sent_outbox after insert on public.ar_sent_events for each row execute function ar_private.tracker_sent_enqueue();
create function public.ar_tracker_status(p_actor uuid,p_region text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o uuid;b ar_private.tracker_bindings;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);select * into b from ar_private.tracker_bindings where region=p_region and owner=o;
 return jsonb_build_object('region',p_region,'connected',b.region is not null,'enabled',coalesce(b.enabled,false),'bootstrapConfirmed',coalesce(b.bootstrap_confirmed,false),'revision',coalesce(b.revision,0),'lastCheckedAt',b.last_checked_at,'lastSuccessAt',b.last_success_at,'error',b.last_error,
 'pending',(select count(*) from ar_private.tracker_outbox where owner=o and state in('pending','uncertain') and hotel=any(ar_private.access_hotels(array[p_region]))),
 'heldWrites',(select count(*) from ar_private.tracker_outbox where owner=o and state='held' and hotel=any(ar_private.access_hotels(array[p_region]))),
 'conflictCount',(select count(*) from ar_private.tracker_conflicts where region=p_region and status='pending'),
 'conflicts',coalesce((select jsonb_agg(x) from (select c.id,c.row_key as "rowKey",c.field,c.reason,c.sheet_value as "sheetValue",c.web_value as "webValue",c.revision from ar_private.tracker_conflicts c where c.region=p_region and c.status='pending' order by c.created_at,c.id limit 50)x),'[]'::jsonb),
 'sheetActivity',coalesce((select jsonb_agg(x) from(select f.actual_date as "actualDate",f.field,count(distinct(f.hotel,f.account_id,f.invoice_id)) as invoices
 from ar_private.tracker_accepted_facts f where f.region=p_region and f.field in('R','U','V','W') and f.actual_date is not null
 and (f.field<>'R' or ar_private.tracker_billing_floor(f.hotel,f.account_id,f.invoice_id) is null or f.actual_date<=ar_private.tracker_billing_floor(f.hotel,f.account_id,f.invoice_id))
 and not exists(select 1 from public.ar_sent_events ev join ar_private.mail_deliveries m on m.id=ev.delivery_id and m.state='sent' where ev.hotel=f.hotel and ev.account_id=f.account_id and f.invoice_id=any(ev.invoice_ids) and (ev.sent_at at time zone 'Asia/Bangkok')::date=f.actual_date and (f.field='R' and ev.purpose='billing' or ev.purpose='collection' and ev.stage=case f.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' when 'W' then 'Follow 3' end))
 group by f.actual_date,f.field order by f.actual_date desc,f.field limit 20)x),'[]'::jsonb));
end $$;
create function public.ar_tracker_connect(p_actor uuid,p_region text,p_file_id text,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;b ar_private.tracker_bindings;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);perform pg_advisory_xact_lock(hashtextextended(p_region,1006));
 select * into b from ar_private.tracker_bindings where region=p_region for update;
 if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{20,200}$' or coalesce(b.revision,0) is distinct from p_revision then return jsonb_build_object('error','tracker_revision_conflict');end if;
 if b.file_id is not null and b.file_id<>p_file_id then return jsonb_build_object('error','tracker_target_conflict');end if;
 insert into ar_private.tracker_bindings(region,owner,file_id,enabled) values(p_region,o,p_file_id,true) on conflict(region) do update set enabled=true,revision=b.revision+1;
 return public.ar_tracker_status(p_actor,p_region);
end $$;
create function public.ar_tracker_claim(p_actor uuid,p_region text,p_lock uuid,p_force boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;b ar_private.tracker_bindings;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);select * into b from ar_private.tracker_bindings where region=p_region and owner=o for update;
 if b.region is null or not b.enabled then return jsonb_build_object('status','disabled');end if;
 if not b.bootstrap_confirmed then return jsonb_build_object('status','preview_required');end if;
 if b.lock_until>now() or not p_force and b.last_checked_at>now()-interval '5 minutes' then return jsonb_build_object('status','busy');end if;
 update ar_private.tracker_bindings set lock_id=p_lock,lock_until=now()+interval '10 minutes',last_checked_at=now(),last_error=null where region=p_region;
 return jsonb_build_object('status','claimed','fileId',b.file_id,'version',b.version);
end $$;
create function public.ar_tracker_candidates(p_actor uuid,p_region text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o uuid;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);if p_offset<0 then raise exception 'tracker_invalid';end if;
 return coalesce((select jsonb_agg(x) from (select i.hotel,i.account_id as "accountId",i.id as "invoiceId",i.invoice_no as "invoiceNo",i.folio_no as "folioNo",i.transaction_date as "transactionDate",coalesce(a.account_no,a.id) as "accountNo",to_jsonb(w) as workflow,to_jsonb(t) as tracking,e.note
 from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id left join ar_private.invoice_tracking t on t.hotel=i.hotel and t.account_id=i.account_id and t.invoice_id=i.id left join public.ar_invoice_exceptions e on e.hotel=i.hotel and e.account_id=i.account_id and e.invoice_id=i.id
 where i.hotel=any(ar_private.access_hotels(array[p_region])) order by i.hotel,i.account_id,i.id offset p_offset limit 500)x),'[]'::jsonb);
end $$;
create function public.ar_tracker_finish(p_actor uuid,p_region text,p_lock uuid,p_version text,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 update ar_private.tracker_bindings set version=case when p_error is null then p_version else version end,last_success_at=case when p_error is null then now() else last_success_at end,last_error=case when p_error is null then null else 'tracker_unavailable' end,lock_id=null,lock_until=null where region=p_region and lock_id=p_lock;
 return jsonb_build_object('finished',found);
end $$;
create function public.ar_tracker_snapshot(p_actor uuid,p_region text,p_lock uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;r jsonb;old ar_private.tracker_rows;w public.ar_invoice_workflow;t ar_private.invoice_tracking;e public.ar_invoice_exceptions;
 match_count integer;a text;i text;f text;sv jsonb;wv jsonb;base jsonb;vals jsonb;merged jsonb;res jsonb;bill date;stage text;sent date;day date;floor_day date;changes integer:=0;conflicts integer:=0;needs_review boolean;seen text[]:='{}';
begin
 o:=ar_private.tracker_authorize(p_actor,p_region);
 perform 1 from ar_private.tracker_bindings where region=p_region and owner=o and lock_id=p_lock and lock_until>now() for update;
 if not found then raise exception 'tracker_lock_lost';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1000 then raise exception 'tracker_invalid';end if;
 -- Use the same lock ordering as confirmed Sent and Register edits.
 perform pg_advisory_xact_lock(hashtextextended(o::text,735));
 for r in select value from jsonb_array_elements(p_rows) loop
  if length(r->>'rowKey') not between 1 and 1000 or not (r->>'hotel')=any(ar_private.access_hotels(array[p_region])) or jsonb_typeof(r->'fields') is distinct from 'object' or (r->'fields')-array['R','S','T','U','V','W','X','Y','Z','AA','AB','AC']<>'{}' then raise exception 'tracker_invalid';end if;
  if r->>'rowKey'=any(seen) then raise exception 'tracker_duplicate_key';end if;seen:=array_append(seen,r->>'rowKey');
  select count(*),min(i.account_id),min(i.id) into match_count,a,i from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
  where i.hotel=r->>'hotel' and i.invoice_no=r->>'invoiceNo' and coalesce(a.account_no,a.id)=r->>'accountNo' and (nullif(r->>'folio','') is null or i.folio_no=r->>'folio') and (nullif(r->>'transactionDate','') is null or i.transaction_date=(r->>'transactionDate')::date);
  select * into old from ar_private.tracker_rows where region=p_region and row_key=r->>'rowKey' for update;
  if r->>'ambiguous'='true' or r->>'holdReason' is not null or old.row_key is not null and old.identity is distinct from (r-array['fields','locator','rowKey','ambiguous','holdReason','reviewFence','issues','fieldHolds','formulaFields','blockedWriteFields']) then match_count:=0;end if;
  insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
  values(p_region,r->>'rowKey',r->>'hotel',case when match_count=1 then a end,case when match_count=1 then i end,r-array['fields','locator','rowKey','ambiguous','holdReason','reviewFence','issues','fieldHolds','formulaFields','blockedWriteFields'],r->'locator',r->'fields')
  on conflict(region,row_key) do update set locator=excluded.locator,sheet_values=excluded.sheet_values,observed_at=now(),present=true,account_id=coalesce(ar_private.tracker_rows.account_id,excluded.account_id),invoice_id=coalesce(ar_private.tracker_rows.invoice_id,excluded.invoice_id);
  if match_count<>1 then
   insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value) values(p_region,r->>'rowKey','identity',coalesce(r->>'holdReason','ambiguous_or_missing_identity'),r-array['fields','locator']) on conflict(region,row_key,field) where status='pending' do nothing;
   conflicts:=conflicts+1;continue;
  end if;
  select * into w from public.ar_invoice_workflow where hotel=r->>'hotel' and account_id=a and invoice_id=i for update;
  select * into t from ar_private.invoice_tracking where hotel=w.hotel and account_id=a and invoice_id=i for update;
  select * into e from public.ar_invoice_exceptions where hotel=w.hotel and account_id=a and invoice_id=i for update;
  if r?'reviewFence' and ((r->'reviewFence'->>'workflow')::integer,(r->'reviewFence'->>'tracking')::integer,(r->'reviewFence'->>'exception')::integer) is distinct from (w.revision,coalesce(t.revision,0),coalesce(e.revision,0)) then
   insert into ar_private.tracker_conflicts(region,row_key,field,reason) values(p_region,r->>'rowKey','identity','web_changed_since_preview') on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,revision=ar_private.tracker_conflicts.revision+1;
   conflicts:=conflicts+1;continue;
  elsif r?'reviewFence' then
   update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='web_changed_since_preview' and status='pending';
  elsif exists(select 1 from ar_private.tracker_conflicts where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='web_changed_since_preview' and status='pending') then conflicts:=conflicts+1;continue;
  end if;
  floor_day:=ar_private.tracker_billing_floor(w.hotel,a,i);
  if floor_day is not null and (w.first_billing_date is null or w.first_billing_date>floor_day) then
   update public.ar_invoice_workflow set first_billing_date=floor_day,revision=revision+1,updated_at=now() where hotel=w.hotel and account_id=a and invoice_id=i returning * into w;
   insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(w.hotel,w.account_id,w.invoice_id,w.revision,p_actor,to_jsonb(w)||jsonb_build_object('source','confirmed_first_billing_guard'));
  end if;
  vals:=jsonb_build_object('R',w.first_billing_date,'S',w.credit_term,'T',w.due_date,'X',t.promised_date,'Y',nullif(t.tracking_status,''),'Z',t.reported_received,'AB',nullif(e.note,''),'AC',nullif(t.owner_name,''));
  foreach f in array array['U','V','W'] loop
   select max((ev.sent_at at time zone 'Asia/Bangkok')::date) into day from public.ar_sent_events ev join ar_private.mail_deliveries m on m.id=ev.delivery_id and m.state='sent'
   where ev.hotel=w.hotel and ev.account_id=a and i=any(ev.invoice_ids) and ev.purpose='collection' and ev.stage=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;
   vals:=vals||jsonb_build_object(f,coalesce(case when w.last_reminder_stage=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end then to_jsonb(w.last_reminder_date) end,to_jsonb(day),old.baseline->f,'null'::jsonb));
  end loop;
  merged:=vals;needs_review:=false;
  foreach f in array array['R','S','T','U','V','W','X','Y','Z','AA','AB','AC'] loop
   sv:=coalesce(r->'fields'->f,'null');wv:=coalesce(vals->f,'null');base:=old.baseline->f;
   if coalesce(r->'fieldHolds','[]')?f then
    insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,'invalid_source_field',sv,wv,base) on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,sheet_value=excluded.sheet_value,revision=ar_private.tracker_conflicts.revision+1;
    conflicts:=conflicts+1;continue;
   end if;
   if f='Y' then
    select coalesce(to_jsonb(raw),'null') into base from ar_private.tracker_reported_status where hotel=w.hotel and account_id=a and invoice_id=i;
    if coalesce(base,'null') is distinct from sv then
     insert into ar_private.tracker_history(region,row_key,field,source,actor,before_value,after_value) values(p_region,r->>'rowKey','Y','sheet_reported_status',p_actor,coalesce(base,'null'),sv);
    end if;
    base:=old.baseline->f;
    if sv='null' or sv#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then
     update ar_private.tracker_rows set baseline=baseline||jsonb_build_object('Y',sv) where region=p_region and row_key=r->>'rowKey';
     update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='Y' and reason='unmapped_tracking_status' and status='pending';
     continue;
    end if;
   end if;
   if f='T' then wv:=coalesce(to_jsonb((case when w.billing_required then case when ar_private.tracker_billing_floor(w.hotel,a,i) is not null and ((merged->>'R')::date is null or (merged->>'R')::date>ar_private.tracker_billing_floor(w.hotel,a,i)) then ar_private.tracker_billing_floor(w.hotel,a,i) else (merged->>'R')::date end when w.billing_required=false then w.base_date end)+w.credit_term),'null');end if;
   -- Normalize numbers as strings, preserving date/null semantics.
   if f in('S','Z') and wv<>'null' then wv:=to_jsonb(wv#>>'{}');end if;
   if f='S' and sv<>'null' then
    if (sv#>>'{}') !~ '^[0-9]{1,4}([.][0-9]+)?$' then
     insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,'invalid_source_field',sv,wv,base) on conflict(region,row_key,field) where status='pending' do nothing;
     conflicts:=conflicts+1;continue;
    end if;
    if (sv#>>'{}')::numeric<>trunc((sv#>>'{}')::numeric) or (sv#>>'{}')::numeric not between 0 and 3650 then
     insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,'invalid_source_field',sv,wv,base) on conflict(region,row_key,field) where status='pending' do nothing;
     conflicts:=conflicts+1;continue;
    end if;sv:=to_jsonb(((sv#>>'{}')::numeric)::integer::text);
   end if;
   if f='Z' then
    if sv<>'null' then sv:=to_jsonb((sv#>>'{}')::numeric(16,2)::text);end if;
    if wv<>'null' then wv:=to_jsonb((wv#>>'{}')::numeric(16,2)::text);end if;
   end if;
   if f in('S','T','AA') then
    if f<>'AA' and sv is distinct from wv and not exists(select 1 from ar_private.tracker_conflicts acknowledged where acknowledged.region=p_region and acknowledged.row_key=r->>'rowKey' and acknowledged.field=f and acknowledged.reason='reference_difference' and acknowledged.status='resolved' and acknowledged.sheet_value is not distinct from sv and acknowledged.web_value is not distinct from wv) then needs_review:=true;
    elsif sv=wv then update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=f and status='pending';end if;
   elsif sv=wv then
    update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(f,sv) where region=p_region and row_key=r->>'rowKey';
    update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=f and status='pending';
    update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=w.hotel and account_id=a and invoice_id=i and field=f and state='conflict';
   elsif base is not null and sv=base then null;
   elsif f in('U','V','W') and w.last_reminder_stage is not null and not exists(select 1 from ar_private.tracker_effective_collection_stage actual where actual.hotel=w.hotel and actual.account_id=a and actual.invoice_id=i and (actual.stage,(actual.sent_at at time zone 'Asia/Bangkok')::date)=(w.last_reminder_stage,w.last_reminder_date)) then needs_review:=true;
   elsif (base is null and wv='null' or base=wv) and sv<>'null' then
    if f='Y' and sv#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then needs_review:=true;
    else merged:=merged||jsonb_build_object(f,sv);end if;
   else needs_review:=true;
   end if;
   if needs_review then
    insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,case when f in('S','T','AA') then 'reference_difference' when f='Y' and sv#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then 'unmapped_tracking_status' else 'concurrent_or_unmapped_edit' end,sv,wv,base)
    on conflict(region,row_key,field) where status='pending' do update set sheet_value=excluded.sheet_value,web_value=excluded.web_value,baseline=excluded.baseline,revision=ar_private.tracker_conflicts.revision+1;
    conflicts:=conflicts+1;needs_review:=false;
   end if;
  end loop;
  bill:=(merged->>'R')::date;stage:=w.last_reminder_stage;sent:=w.last_reminder_date;
  foreach f in array array['U','V','W'] loop
   day:=(merged->>f)::date;if day is not null and (sent is null or day>sent) then stage:=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;sent:=day;end if;
  end loop;
  if merged is distinct from vals then
   insert into ar_private.tracker_workflow_origin(hotel,account_id,invoice_id,revision,stage_owned) values(w.hotel,a,i,w.revision,(stage,sent) is distinct from (w.last_reminder_stage,w.last_reminder_date) or exists(select 1 from ar_private.tracker_effective_collection_stage actual where actual.hotel=w.hotel and actual.account_id=a and actual.invoice_id=i and (actual.stage,(actual.sent_at at time zone 'Asia/Bangkok')::date)=(w.last_reminder_stage,w.last_reminder_date)))
   on conflict(hotel,account_id,invoice_id) do update set stage_owned=excluded.stage_owned or ar_private.tracker_workflow_origin.stage_owned and ar_private.tracker_workflow_origin.revision=w.revision,revision=w.revision;
   res:=public.ar_invoice_register_save(p_actor,w.hotel,a,i,jsonb_build_object('commandId',gen_random_uuid(),'workflowRevision',w.revision,'exceptionRevision',coalesce(e.revision,0),'revision',coalesce(t.revision,0),'values',jsonb_build_object('billingRequired',w.billing_required,'creditTerm',w.credit_term,'firstBillingDate',bill,'lastReminderStage',stage,'lastReminderDate',sent,'promisedDate',merged->>'X','trackingStatus',coalesce(merged->>'Y',''),'ownerName',coalesce(merged->>'AC',''),'reportedReceived',case when merged->>'Z' is null then null else (merged->>'Z')::numeric end,'note',coalesce(merged->>'AB',''))));
   if res?'error' then raise exception 'tracker_import_rejected';end if;
   update ar_private.tracker_workflow_origin set revision=(select revision from public.ar_invoice_workflow where hotel=w.hotel and account_id=a and invoice_id=i) where hotel=w.hotel and account_id=a and invoice_id=i;
   foreach f in array array['R','U','V','W','X','Y','Z','AB','AC'] loop
    if merged->f is distinct from vals->f then
     insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,before_value,after_value) values(p_region,r->>'rowKey',f,case when f in('R','U','V','W','X') then (merged->>f)::date end,'sheet_actual',p_actor,vals->f,merged->f);
     update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(f,merged->f) where region=p_region and row_key=r->>'rowKey';
    end if;
   end loop;changes:=changes+1;
  end if;
  select * into w from public.ar_invoice_workflow where hotel=w.hotel and account_id=a and invoice_id=i;
  update ar_private.tracker_rows set web_values=merged||jsonb_build_object('_workflowRevision',w.revision) where region=p_region and row_key=r->>'rowKey';
 end loop;
 return jsonb_build_object('imported',changes,'conflicts',conflicts);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'tracker_invalid';
end $$;
create function public.ar_tracker_outbox(p_actor uuid,p_region text,p_lock uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o uuid;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 return coalesce((select jsonb_agg(x) from(select q.id,q.delivery_id as "deliveryId",r.row_key as "rowKey",r.identity,r.locator,q.field,r.sheet_values->q.field as expected,
 to_jsonb(case when q.field='R' then w.first_billing_date else (select max((latest.sent_at at time zone 'Asia/Bangkok')::date) from public.ar_sent_events latest join ar_private.mail_deliveries sent_delivery on sent_delivery.id=latest.delivery_id and sent_delivery.state='sent' where latest.hotel=q.hotel and latest.account_id=q.account_id and q.invoice_id=any(latest.invoice_ids) and latest.purpose='collection' and latest.stage=ev.stage) end) as value,q.state
 from ar_private.tracker_outbox q join public.ar_sent_events ev on ev.delivery_id=q.delivery_id join ar_private.mail_deliveries m on m.id=q.delivery_id and m.state='sent'
 join public.ar_invoice_workflow w on w.hotel=q.hotel and w.account_id=q.account_id and w.invoice_id=q.invoice_id
 join ar_private.tracker_rows r on r.region=p_region and r.hotel=q.hotel and r.account_id=q.account_id and r.invoice_id=q.invoice_id and r.present
 where q.owner=o and q.state in('pending','uncertain','held') and q.hotel=any(ar_private.access_hotels(array[p_region])) and (select count(*) from ar_private.tracker_rows mapped where mapped.region=p_region and mapped.hotel=q.hotel and mapped.account_id=q.account_id and mapped.invoice_id=q.invoice_id and mapped.present)=1 and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.status='pending' and c.field in(q.field,'identity'))
 order by q.created_at,q.id limit 100)x),'[]');
end $$;
create function public.ar_tracker_write_result(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_state text,p_expected jsonb,p_value jsonb,p_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;q ar_private.tracker_outbox;r ar_private.tracker_rows;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);
 if p_state not in('written','conflict','uncertain','held') or not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_invalid';end if;
 select * into q from ar_private.tracker_outbox where id=p_id and owner=o and hotel=any(ar_private.access_hotels(array[p_region])) for update;
 if q.id is null then raise exception 'tracker_forbidden';end if;if q.state='written' then return jsonb_build_object('state','written');end if;
 select * into r from ar_private.tracker_rows where region=p_region and hotel=q.hotel and account_id=q.account_id and invoice_id=q.invoice_id and present for update;
 update ar_private.tracker_outbox set state=p_state,attempts=attempts+case when p_state='held' then 0 else 1 end,expected_value=p_expected,desired_value=p_value,provider_version=p_version,updated_at=now() where id=p_id;
 if p_state='written' then
  update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(q.field,p_value),sheet_values=sheet_values||jsonb_build_object(q.field,p_value) where region=p_region and row_key=r.row_key;
  insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,before_value,after_value,delivery_id) values(p_region,r.row_key,q.field,(p_value#>>'{}')::date,'confirmed_sent_writeback',p_actor,p_expected,p_value,q.delivery_id);
 elsif p_state='conflict' and r.row_key is not null then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r.row_key,q.field,'writeback_requires_review',p_expected,p_value,r.baseline->q.field) on conflict(region,row_key,field) where status='pending' do nothing;
 end if;return jsonb_build_object('state',p_state);
end $$;
create function public.ar_tracker_membership(p_actor uuid,p_region text,p_lock uuid,p_keys jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 if jsonb_typeof(p_keys) is distinct from 'array' or not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_invalid';end if;
 -- Source absence is a membership observation, never deletion or OPERA zero.
 update ar_private.tracker_rows set present=false where region=p_region and not row_key in(select jsonb_array_elements_text(p_keys));
 return jsonb_build_object('observed',true);
end $$;
create function public.ar_tracker_resolve(p_actor uuid,p_region text,p_id uuid,p_revision integer,p_choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;c ar_private.tracker_conflicts;r ar_private.tracker_rows;w public.ar_invoice_workflow;t ar_private.invoice_tracking;e public.ar_invoice_exceptions;values jsonb;current_value jsonb;result jsonb;day date;stage text;sent date;
begin
 o:=ar_private.tracker_authorize(p_actor,p_region);perform pg_advisory_xact_lock(hashtextextended(o::text,735));
 select * into c from ar_private.tracker_conflicts where id=p_id and region=p_region for update;
 if c.id is null or c.revision is distinct from p_revision or c.status<>'pending' or p_choice not in('keep_web','accept_sheet') then return jsonb_build_object('error','tracker_revision_conflict');end if;
 if c.field='identity' then return jsonb_build_object('error','tracker_identity_requires_review');end if;
 select * into r from ar_private.tracker_rows where region=p_region and row_key=c.row_key for update;
 select * into w from public.ar_invoice_workflow where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id for update;
 select * into t from ar_private.invoice_tracking where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id for update;
 select * into e from public.ar_invoice_exceptions where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id for update;
 if w.invoice_id is null then return jsonb_build_object('error','tracker_identity_requires_review');end if;
 if p_choice='accept_sheet' then
  if c.field not in('R','U','V','W','X','Y','Z','AB','AC') then return jsonb_build_object('error','tracker_reference_only');end if;
  if c.reason='invalid_source_field' then return jsonb_build_object('error','tracker_source_field_requires_review');end if;
  current_value:=case c.field when 'R' then to_jsonb(w.first_billing_date) when 'X' then to_jsonb(t.promised_date) when 'Y' then to_jsonb(nullif(t.tracking_status,'')) when 'Z' then to_jsonb(t.reported_received::text) when 'AB' then to_jsonb(nullif(e.note,'')) when 'AC' then to_jsonb(nullif(t.owner_name,'')) else r.web_values->c.field end;
  if coalesce(current_value,'null') is distinct from coalesce(c.web_value,'null') then return jsonb_build_object('error','tracker_revision_conflict');end if;
  values:=jsonb_build_object('billingRequired',w.billing_required,'creditTerm',w.credit_term,'firstBillingDate',w.first_billing_date,'lastReminderStage',w.last_reminder_stage,'lastReminderDate',w.last_reminder_date,'promisedDate',t.promised_date,'trackingStatus',coalesce(t.tracking_status,''),'ownerName',coalesce(t.owner_name,''),'reportedReceived',t.reported_received,'note',coalesce(e.note,''));
  if c.field in('U','V','W') then
   day:=(c.sheet_value#>>'{}')::date;stage:=case c.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;
   if day is not null and (w.last_reminder_date is null or day>w.last_reminder_date) then values:=values||jsonb_build_object('lastReminderStage',stage,'lastReminderDate',day);end if;
  else
   values:=values||jsonb_build_object(case c.field when 'R' then 'firstBillingDate' when 'X' then 'promisedDate' when 'Y' then 'trackingStatus' when 'Z' then 'reportedReceived' when 'AB' then 'note' else 'ownerName' end,case when c.field in('Y','AB','AC') then case when c.sheet_value is null or c.sheet_value='null' then '""'::jsonb else c.sheet_value end else c.sheet_value end);
  end if;
  insert into ar_private.tracker_workflow_origin(hotel,account_id,invoice_id,revision,stage_owned) values(w.hotel,w.account_id,w.invoice_id,w.revision,(values->>'lastReminderStage',values->>'lastReminderDate') is distinct from (w.last_reminder_stage,w.last_reminder_date::text) or c.field in('U','V','W') and w.last_reminder_stage=case c.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end and w.last_reminder_date=(c.web_value#>>'{}')::date)
  on conflict(hotel,account_id,invoice_id) do update set stage_owned=excluded.stage_owned or ar_private.tracker_workflow_origin.stage_owned and ar_private.tracker_workflow_origin.revision=w.revision,revision=w.revision;
  result:=public.ar_invoice_register_save(p_actor,r.hotel,r.account_id,r.invoice_id,jsonb_build_object('commandId',gen_random_uuid(),'workflowRevision',w.revision,'exceptionRevision',coalesce(e.revision,0),'revision',coalesce(t.revision,0),'values',values));
  if result?'error' then raise exception 'tracker_import_rejected';end if;
  update ar_private.tracker_workflow_origin set revision=(select revision from public.ar_invoice_workflow where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id) where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id;
  insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,before_value,after_value) values(p_region,r.row_key,c.field,case when c.field in('R','U','V','W','X') then (c.sheet_value#>>'{}')::date end,'sheet_actual_reviewed',p_actor,c.web_value,c.sheet_value);
 end if;
 -- A reviewed choice acknowledges this exact observed sheet value. It does not
 -- grant permission to overwrite later spreadsheet edits or immutable Sent.
 update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(c.field,c.sheet_value),web_values=case when p_choice='accept_sheet' then web_values||jsonb_build_object(c.field,c.sheet_value) else web_values end where region=p_region and row_key=c.row_key;
 update ar_private.tracker_conflicts set status='resolved',resolved_by=p_actor,resolved_at=now() where id=p_id;
 update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=r.hotel and account_id=r.account_id and invoice_id=r.invoice_id and field=c.field and (state='conflict' or p_choice='keep_web' and state='written');
 return jsonb_build_object('resolved',true);
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('error','tracker_invalid');
end $$;
create function public.ar_tracker_scheduled_bindings() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('region',region,'owner',owner)),'[]') from ar_private.tracker_bindings where enabled and owner=ar_private.access_owner();
$$;
create function public.ar_tracker_revisions(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member ar_private.access_members;begin
 member:=ar_private.access_member(p_actor);if member.email is null then raise exception 'tracker_forbidden';end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('region',region,'revision',revision::text) order by region) from ar_private.tracker_data_revisions where region=any(member.regions)),'[]'));
end $$;
revoke all on function public.ar_tracker_revisions(uuid) from public,anon,authenticated;
grant execute on function public.ar_tracker_revisions(uuid) to service_role;
create function public.ar_tracker_preview(p_actor uuid,p_region text,p_file_id text,p_version text,p_hash text,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;b ar_private.tracker_bindings;preview uuid;r jsonb;w public.ar_invoice_workflow;web_values jsonb;f text;sv jsonb;wv jsonb;match_count integer;a text;i text;matched integer:=0;held integer:=0;eligible integer:=0;reported integer:=0;conflicting integer:=0;details jsonb:='[]';review_rows jsonb:='[]';fence jsonb;choice text;
begin
 o:=ar_private.tracker_authorize(p_actor,p_region);select * into b from ar_private.tracker_bindings where region=p_region and owner=o;
 if b.file_id is distinct from p_file_id or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100000 or octet_length(p_rows::text)>16777216 or p_hash !~ '^[0-9a-f]{64}$' or p_version is null then raise exception 'tracker_invalid';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select count(*),min(src.account_id),min(src.id) into match_count,a,i from ar_private.invoice_register_source src where src.hotel=r->>'hotel' and src.invoice_no=r->>'invoiceNo' and coalesce(src.account_no,src.account_id)=r->>'accountNo' and (nullif(r->>'folio','') is null or src.folio_no=r->>'folio') and (nullif(r->>'transactionDate','') is null or src.transaction_date=(r->>'transactionDate')::date);
  if match_count<>1 or r->>'ambiguous'='true' or r->>'holdReason' is not null then held:=held+1;review_rows:=review_rows||jsonb_build_array(r);continue;end if;
  matched:=matched+1;
  select jsonb_build_object('R',src.first_billing_date::text,'S',src.credit_term::text,'T',src.due_date::text,'U',case when src.last_reminder_stage='Follow 1' then src.last_reminder_date::text end,'V',case when src.last_reminder_stage='Follow 2' then src.last_reminder_date::text end,'W',case when src.last_reminder_stage='Follow 3' then src.last_reminder_date::text end,'X',src.promised_date::text,'Y',nullif(src.tracking_status,''),'Z',src.reported_received,'AB',nullif(src.note,''),'AC',nullif(src.owner_name,'')) into web_values from ar_private.invoice_register_source src where src.hotel=r->>'hotel' and src.account_id=a and src.id=i;
  select jsonb_build_object('workflow',src.workflow_revision,'tracking',src.tracking_revision,'exception',src.exception_revision) into fence from ar_private.invoice_register_source src where src.hotel=r->>'hotel' and src.account_id=a and src.id=i;
  review_rows:=review_rows||jsonb_build_array(r||jsonb_build_object('reviewFence',fence));
  for f,sv in select key,value from jsonb_each(r->'fields') loop
   wv:=coalesce(web_values->f,'null');
   if coalesce(r->'fieldHolds','[]')?f then conflicting:=conflicting+1;continue;end if;
   if f='S' and sv<>'null' then
    if (sv#>>'{}') !~ '^[0-9]{1,4}([.][0-9]+)?$' then conflicting:=conflicting+1;continue;end if;
    if (sv#>>'{}')::numeric<>trunc((sv#>>'{}')::numeric) or (sv#>>'{}')::numeric not between 0 and 3650 then conflicting:=conflicting+1;continue;end if;
    sv:=to_jsonb(((sv#>>'{}')::numeric)::integer::text);
   end if;
   if f='Z' then
    if sv<>'null' then sv:=to_jsonb((sv#>>'{}')::numeric(16,2)::text);end if;
    if wv<>'null' then wv:=to_jsonb((wv#>>'{}')::numeric(16,2)::text);end if;
   end if;
   choice:=case when f='AA' then 'reference' when f in('S','T') then case when sv=wv then 'reference' else 'reference_difference' end when f='Y' and (sv='null' or sv#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other')) then 'reported_source' when sv=wv then 'same' when sv='null' and wv='null' then 'same' when wv='null' and sv<>'null' then 'eligible' else 'conflict' end;
   if choice='eligible' then eligible:=eligible+1;elsif choice in('conflict','reference_difference') then conflicting:=conflicting+1;end if;
   if choice='reported_source' and sv<>'null' then reported:=reported+1;end if;
   if (choice in('eligible','conflict','reference_difference') or choice='reported_source' and sv<>'null') and jsonb_array_length(details)<200 then details:=details||jsonb_build_array(jsonb_build_object('rowKey',r->>'rowKey','field',f,'sheetValue',sv,'webValue',wv,'decision',choice));end if;
  end loop;
 end loop;
 -- Replace only this actor's abandoned previews; no provider files are involved.
 delete from ar_private.tracker_previews where region=p_region and actor=p_actor and status='pending';
 insert into ar_private.tracker_previews(region,actor,file_id,version,snapshot_hash,rows) values(p_region,p_actor,p_file_id,p_version,p_hash,review_rows) returning id into preview;
 return jsonb_build_object('previewId',preview,'snapshotHash',p_hash,'version',p_version,'rowCount',jsonb_array_length(p_rows),'matchedRows',matched,'heldRows',held,'eligibleFields',eligible,'reportedStatuses',reported,'conflictingFields',conflicting,'details',details);
end $$;
create function public.ar_tracker_confirm_preview(p_actor uuid,p_region text,p_id uuid,p_hash text,p_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;p ar_private.tracker_previews;b ar_private.tracker_bindings;preview_lock uuid:=gen_random_uuid();offset_rows integer:=0;batch jsonb;result jsonb;imports integer:=0;conflicts integer:=0;
begin
 o:=ar_private.tracker_authorize(p_actor,p_region);select * into b from ar_private.tracker_bindings where region=p_region and owner=o for update;
 select * into p from ar_private.tracker_previews where id=p_id and region=p_region and actor=p_actor for update;
 if p.id is null or p.snapshot_hash is distinct from p_hash or p.version is distinct from p_version or p.file_id is distinct from b.file_id then return jsonb_build_object('error','tracker_preview_changed');end if;
 if p.status='confirmed' then return jsonb_build_object('confirmed',true,'replayed',true);end if;
 if p.created_at<now()-interval '15 minutes' or b.lock_until>now() then return jsonb_build_object('error','tracker_preview_expired_or_busy');end if;
 update ar_private.tracker_bindings set lock_id=preview_lock,lock_until=now()+interval '10 minutes',bootstrap_confirmed=true where region=p_region;
 loop
  select coalesce(jsonb_agg(value),'[]') into batch from(select value from jsonb_array_elements(p.rows) with ordinality x(value,ordinal) order by ordinal offset offset_rows limit 500)x;
  exit when jsonb_array_length(batch)=0;
  result:=public.ar_tracker_snapshot(p_actor,p_region,preview_lock,batch);imports:=imports+(result->>'imported')::int;conflicts:=conflicts+(result->>'conflicts')::int;offset_rows:=offset_rows+500;
 end loop;
 perform public.ar_tracker_membership(p_actor,p_region,preview_lock,(select coalesce(jsonb_agg(value->>'rowKey'),'[]') from jsonb_array_elements(p.rows)));
 insert into ar_private.tracker_outbox(delivery_id,owner,hotel,account_id,invoice_id,field)
 select distinct on(s.hotel,s.account_id,s.invoice_id,case when s.purpose='billing' then 'R' when s.stage='Follow 1' then 'U' when s.stage='Follow 2' then 'V' when s.stage='Follow 3' then 'W' end)
 s.delivery_id,s.owner,s.hotel,s.account_id,s.invoice_id,case when s.purpose='billing' then 'R' when s.stage='Follow 1' then 'U' when s.stage='Follow 2' then 'V' when s.stage='Follow 3' then 'W' end
 from ar_private.report_sent_invoices s where s.owner=o and (s.purpose='billing' or s.purpose='collection' and s.stage in('Follow 1','Follow 2','Follow 3'))
 and exists(select 1 from ar_private.tracker_rows r where r.region=p_region and r.hotel=s.hotel and r.account_id=s.account_id and r.invoice_id=s.invoice_id and r.present)
 order by s.hotel,s.account_id,s.invoice_id,case when s.purpose='billing' then 'R' when s.stage='Follow 1' then 'U' when s.stage='Follow 2' then 'V' when s.stage='Follow 3' then 'W' end,s.sent_at desc,s.workflow_revision_before_send desc nulls last,s.delivery_id desc
 on conflict(delivery_id,invoice_id,field) do nothing;
 perform public.ar_tracker_finish(p_actor,p_region,preview_lock,p_version,null);
 update ar_private.tracker_previews set status='confirmed',confirmed_at=now(),rows='[]' where id=p_id;
 return jsonb_build_object('confirmed',true,'imported',imports,'conflicts',conflicts);
end $$;
revoke all on function ar_private.tracker_authorize(uuid,text),ar_private.tracker_sent_enqueue() from public,anon,authenticated,service_role;
revoke all on function public.ar_tracker_status(uuid,text),public.ar_tracker_connect(uuid,text,text,integer),public.ar_tracker_claim(uuid,text,uuid,boolean),public.ar_tracker_candidates(uuid,text,integer),public.ar_tracker_finish(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ar_tracker_status(uuid,text),public.ar_tracker_connect(uuid,text,text,integer),public.ar_tracker_claim(uuid,text,uuid,boolean),public.ar_tracker_candidates(uuid,text,integer),public.ar_tracker_finish(uuid,text,uuid,text,text) to service_role;
revoke all on function public.ar_tracker_snapshot(uuid,text,uuid,jsonb),public.ar_tracker_outbox(uuid,text,uuid),public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ar_tracker_snapshot(uuid,text,uuid,jsonb),public.ar_tracker_outbox(uuid,text,uuid),public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text) to service_role;
revoke all on function public.ar_tracker_membership(uuid,text,uuid,jsonb),public.ar_tracker_resolve(uuid,text,uuid,integer,text),public.ar_tracker_scheduled_bindings() from public,anon,authenticated;
grant execute on function public.ar_tracker_membership(uuid,text,uuid,jsonb),public.ar_tracker_resolve(uuid,text,uuid,integer,text),public.ar_tracker_scheduled_bindings() to service_role;
revoke all on function public.ar_tracker_preview(uuid,text,text,text,text,jsonb),public.ar_tracker_confirm_preview(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ar_tracker_preview(uuid,text,text,text,text,jsonb),public.ar_tracker_confirm_preview(uuid,text,uuid,text,text) to service_role;

-- Accepted historical Sheet facts retain day precision and separate provenance.
-- They never masquerade as Gmail messages or historical money evidence.
create view ar_private.tracker_effective_collection_stage as
 select distinct on(hotel,account_id,invoice_id) hotel,account_id,invoice_id,stage,stage_snapshot,sent_at,source,date_precision
 from(
 select e.hotel,e.account_id,ids.invoice_id,e.stage,e.stage_snapshot,e.sent_at,'gmail_sent'::text as source,'timestamp'::text as date_precision,
 (e.sent_at at time zone 'Asia/Bangkok')::date as actual_day,1 as precision_priority,e.delivery_id::text as event_key,
 (select case when fact->>'revision' ~ '^[0-9]{1,10}$' then (fact->>'revision')::bigint end from jsonb_array_elements(m.snapshot->'workflow') fact where fact->>'invoice_id'=ids.invoice_id and fact->>'hotel'=e.hotel and fact->>'account_id'=e.account_id limit 1) as workflow_revision,
 0 as stage_position
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft') cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 where e.purpose='collection' and e.sent_at<=clock_timestamp() and ar_private.financial_actor(e.owner)
 union all
 select f.hotel,f.account_id,f.invoice_id,case f.field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end,null::jsonb,f.actual_date::timestamp at time zone 'Asia/Bangkok','sheet_actual','day',f.actual_date,0,f.history_id::text,null::bigint,case f.field when 'U' then 1 when 'V' then 2 else 3 end
 from ar_private.tracker_accepted_facts f where f.field in('U','V','W') and f.actual_date is not null and f.actual_date<=(now() at time zone 'Asia/Bangkok')::date
 ) facts order by hotel,account_id,invoice_id,actual_day desc,precision_priority desc,sent_at desc,workflow_revision desc nulls last,stage_position desc,event_key desc;
revoke all on ar_private.tracker_effective_collection_stage from public,anon,authenticated,service_role;

create or replace view ar_private.dashboard_current_invoices as
 select i.hotel,i.account_id,i.id as invoice_id,a.account_no,a.name as account_name,a.type as account_type,
 i.invoice_no,i.folio_no,i.guest,i.transaction_date,i.open,i.original,i.age,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,
 latest.stage as latest_stage,coalesce(latest.stage_snapshot->>'label',latest.stage) as latest_stage_label,latest.sent_at as latest_sent_at,
 coalesce(i.verification_state='verified' and i.collection_role in('standalone','parent') and a.verification_state='verified',false) as verified
 from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 left join ar_private.tracker_effective_collection_stage latest on latest.hotel=i.hotel and latest.account_id=i.account_id and latest.invoice_id=i.id
 where i.collection_role<>'child' and (i.open<>0 or i.verification_state not in('verified','cleared'));

create view ar_private.tracker_report_current_events as
 select owner,hotel,account_id,invoice_id,kind,sent_at,stage_snapshot,stage_label,terminal_stage,purpose,workflow_revision_before_send,delivery_id,'gmail_sent'::text as source,'timestamp'::text as date_precision
 from ar_private.report_sent_invoices
 union all
 select ar_private.access_owner(),f.hotel,f.account_id,f.invoice_id,f.stage,f.sent_at,f.stage_snapshot,
 replace(f.stage,'Follow ','Follow-up '),false,'collection',null::bigint,null::uuid,f.source,f.date_precision
 from ar_private.tracker_effective_collection_stage f where f.source='sheet_actual';
revoke all on ar_private.tracker_report_current_events from public,anon,authenticated,service_role;
do $$declare definition text;needle text:='select kind,sent_at,stage_snapshot,stage_label,terminal_stage from ar_private.report_sent_invoices s';begin
 definition:=pg_get_functiondef('public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'tracker_report_projection_definition_drift';end if;
 definition:=replace(definition,needle,'select kind,sent_at,stage_snapshot,stage_label,terminal_stage,source,date_precision from ar_private.tracker_report_current_events s');
 definition:=replace(definition,'latest.stage_label as latest_stage_label','latest.stage_label as latest_stage_label,latest.source as latest_source,latest.date_precision as latest_date_precision');
 execute definition;
end $$;

create function ar_private.tracker_capture_current() returns trigger language plpgsql security definer set search_path='' as $$
declare d date:=(now() at time zone 'Asia/Bangkok')::date;begin
 -- Only today's mutable observation changes; prior published snapshots stay intact.
 update ar_private.dashboard_daily_invoices snap set latest_stage=c.latest_stage,latest_stage_label=c.latest_stage_label,latest_sent_at=c.latest_sent_at
 from ar_private.dashboard_current_invoices c where snap.hotel=new.hotel and snap.account_id=new.account_id and snap.invoice_id=new.invoice_id and snap.day=d and c.hotel=snap.hotel and c.account_id=snap.account_id and c.invoice_id=snap.invoice_id;
 return new;
end $$;
create trigger tracker_capture_current after insert or update on ar_private.tracker_accepted_facts for each row execute function ar_private.tracker_capture_current();
revoke all on function ar_private.tracker_capture_current() from public,anon,authenticated,service_role;
create function ar_private.tracker_apply_stage() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.ar_invoice_workflow;p ar_private.tracker_workflow_origin;stage ar_private.tracker_effective_collection_stage;begin
 if new.field not in('U','V','W') then return new;end if;
 select * into w from public.ar_invoice_workflow where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id for update;
 select * into p from ar_private.tracker_workflow_origin where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id for update;
 if not coalesce(p.stage_owned,false) or p.revision is distinct from w.revision then return new;end if;
 select * into stage from ar_private.tracker_effective_collection_stage where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id;
 if (w.last_reminder_stage,w.last_reminder_date) is distinct from (stage.stage,(stage.sent_at at time zone 'Asia/Bangkok')::date) then
  update public.ar_invoice_workflow set last_reminder_stage=stage.stage,last_reminder_date=(stage.sent_at at time zone 'Asia/Bangkok')::date,
  last_reminder_stage_snapshot=stage.stage_snapshot,last_reminder_policy_version=(stage.stage_snapshot->>'policyVersion')::integer,revision=revision+1,updated_at=now()
  where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id returning * into w;
  update ar_private.tracker_workflow_origin set revision=w.revision where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id;
  insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(w.hotel,w.account_id,w.invoice_id,w.revision,(select actor from ar_private.tracker_history where id=new.history_id),to_jsonb(w)||jsonb_build_object('source','tracker_effective_stage'));
 end if;return new;
end $$;
create trigger tracker_apply_stage after insert or update on ar_private.tracker_accepted_facts for each row execute function ar_private.tracker_apply_stage();
revoke all on function ar_private.tracker_apply_stage() from public,anon,authenticated,service_role;

-- Optional source facts extend the existing workbook surface; its canonical
-- tracking enum and editable values retain their existing meaning.
create or replace view ar_private.invoice_register_source as
select i.hotel,i.account_id,i.id,a.name as account_name,a.account_no,a.type as account_type,i.guest,i.invoice_no,i.folio_no,i.transaction_date,i.original,i.open,i.age,i.aging,i.verification_state,i.collection_role,i.collection_selectable,
 to_jsonb(w) as workflow,w.revision as workflow_revision,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,w.last_reminder_stage,w.last_reminder_date,
 coalesce(t.revision,0) as tracking_revision,t.promised_date,coalesce(t.tracking_status,'') as tracking_status,coalesce(t.owner_name,'') as owner_name,t.reported_received::text,
 coalesce(e.revision,0) as exception_revision,coalesce(e.note,'') as note,greatest(t.updated_at,e.updated_at,w.updated_at) as edited_at,
 reported.raw as "sourceTrackingStatusRaw",reported.observed_at as "sourceTrackingStatusObservedAt",case when reported.raw is not null then 'Sheet record; editor unavailable' end as "sourceTrackingStatusProvenance"
from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
left join ar_private.invoice_tracking t on t.hotel=i.hotel and t.account_id=i.account_id and t.invoice_id=i.id
left join public.ar_invoice_exceptions e on e.hotel=i.hotel and e.account_id=i.account_id and e.invoice_id=i.id
left join ar_private.tracker_reported_status reported on reported.hotel=i.hotel and reported.account_id=i.account_id and reported.invoice_id=i.id;
create or replace function public.ar_invoice_register_history(p_actor uuid,p_hotel text,p_account text,p_invoice text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hotels text[];result jsonb;
begin
 hotels:=ar_private.invoice_register_hotels(p_actor,p_hotel);if not p_hotel=any(hotels) then raise exception 'register_forbidden';end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','register_invalid');end if;
 with history as materialized(
 select h.id,h.recorded_at,h.before_value,h.after_value,ar_private.staff_label(h.actor) as actor,'register'::text as source,null::text as "sourceTrackingStatusBefore",null::text as "sourceTrackingStatusAfter"
 from ar_private.invoice_register_history h where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice
 union all
 select -h.id,h.observed_at,'{}'::jsonb,'{}'::jsonb,'Sheet record · editor unavailable; imported by '||ar_private.staff_label(h.actor),'sheet_reported_status',h.before_value#>>'{}',h.after_value#>>'{}'
 from ar_private.tracker_history h where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice and h.field='Y' and h.source='sheet_reported_status'
 )
 select jsonb_build_object('total',(select count(*) from history),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from history order by recorded_at desc,abs(id) desc offset p_offset limit 20)x),'[]')) into result;return result;
exception when others then if sqlerrm='register_forbidden' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;
