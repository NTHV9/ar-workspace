-- Separate, private source observations. No OPERA/current-debt/workflow or sent-event writes.
create function ar_private.financial_actor(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false));
$$;
create function ar_private.financial_money(v numeric) returns text language sql immutable set search_path='' as $$select case when v is null then null else round(v,2)::text end$$;
create table ar_private.financial_runs(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),hotel text not null check(hotel in('KAT','TSK')),
 source_from date not null,source_to date not null,reason text not null check(reason in('manual','scheduled','backfill','open')),proof text not null,
 status text not null default 'queued' check(status in('queued','running','succeeded','failed')),discovered boolean not null default false,
 account_count integer not null default 0,invoice_count bigint not null default 0,payment_count bigint not null default 0,application_count bigint not null default 0,
 initial_import boolean not null,created_at timestamptz not null default clock_timestamp(),started_at timestamptz,finished_at timestamptz,lease_until timestamptz,error_code text,
 check(source_from<=source_to and source_to-source_from<366)
);
create unique index financial_one_running_hotel on ar_private.financial_runs(hotel) where status='running';
create index financial_pending_scope on ar_private.financial_runs(owner,hotel,source_from,source_to,created_at) where status in('queued','running');
create table ar_private.financial_commands(owner uuid not null,command_id uuid not null,request jsonb not null,run_id uuid not null references ar_private.financial_runs(id),primary key(owner,command_id));
create table ar_private.financial_run_accounts(
 run_id uuid not null references ar_private.financial_runs(id),account_id text not null,ordinal integer not null,
 staged boolean not null default false,context jsonb,counts jsonb,coverage jsonb,mapping_invoices text[],staged_at timestamptz,
 primary key(run_id,account_id),unique(run_id,ordinal)
);
create table ar_private.financial_stage_batches(
 run_id uuid not null,account_id text not null,kind text not null check(kind in('invoice','payment','application')),
 batch integer not null check(batch>=0),rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 500),
 primary key(run_id,account_id,kind,batch),foreign key(run_id,account_id) references ar_private.financial_run_accounts(run_id,account_id)
);
create table ar_private.financial_accounts(hotel text not null,account_id text not null,name text not null,type text not null,account_no text,observed_at timestamptz not null,run_id uuid not null references ar_private.financial_runs(id),primary key(hotel,account_id));
create table ar_private.financial_invoice_entries(
 hotel text not null,account_id text not null,transaction_id text not null,source_date date,
 original_amount numeric,current_amount numeric,cumulative_payments numeric,open_amount numeric,source_data jsonb not null,
 source_status text not null check(source_status in('observed','not_observed')),first_observed_at timestamptz not null,last_observed_at timestamptz not null,last_checked_at timestamptz not null,
 run_id uuid not null references ar_private.financial_runs(id),primary key(hotel,account_id,transaction_id)
);
create table ar_private.financial_payments(
 hotel text not null,account_id text not null,transaction_id text not null,source_date date,
 amount numeric,applied_amount numeric,unallocated_amount numeric,source_data jsonb not null,
 source_status text not null check(source_status in('observed','not_observed')),first_observed_at timestamptz not null,last_observed_at timestamptz not null,last_checked_at timestamptz not null,
 run_id uuid not null references ar_private.financial_runs(id),primary key(hotel,account_id,transaction_id)
);
create table ar_private.financial_applications(
 hotel text not null,account_id text not null,invoice_id text not null,payment_id text not null,applied_amount numeric,invoice_date date,
 application_date date check(application_date is null),source_data jsonb not null,
 source_status text not null check(source_status in('observed','not_observed')),first_observed_at timestamptz not null,last_observed_at timestamptz not null,last_checked_at timestamptz not null,
 run_id uuid not null references ar_private.financial_runs(id),primary key(hotel,account_id,invoice_id,payment_id)
);
create table ar_private.financial_publications(
 run_id uuid primary key references ar_private.financial_runs(id),hotel text not null,source_from date not null,source_to date not null,published_at timestamptz not null,
 accounts integer not null,invoices bigint not null,payments bigint not null,applications bigint not null,initial_import boolean not null,period_complete boolean not null,proof text not null
);
create table ar_private.financial_changes(
 id bigint generated always as identity primary key,run_id uuid not null references ar_private.financial_runs(id),hotel text not null,account_id text not null,kind text not null,identity text not null,
 previous_data jsonb,next_data jsonb not null,previous_status text,next_status text not null,observed_at timestamptz not null,
 unique(run_id,hotel,account_id,kind,identity)
);
create index financial_invoice_dates on ar_private.financial_invoice_entries(hotel,source_date,account_id,transaction_id);
create index financial_payment_dates on ar_private.financial_payments(hotel,source_date,account_id,transaction_id);
create index financial_application_payment on ar_private.financial_applications(hotel,account_id,payment_id);
create index financial_publication_range on ar_private.financial_publications(hotel,source_from,source_to,published_at desc);
create index financial_changes_scope on ar_private.financial_changes(hotel,account_id,observed_at desc);
do $$declare t text;begin foreach t in array array['financial_runs','financial_commands','financial_run_accounts','financial_stage_batches','financial_accounts','financial_invoice_entries','financial_payments','financial_applications','financial_publications','financial_changes'] loop
 execute format('alter table ar_private.%I enable row level security',t);execute format('revoke all on ar_private.%I from public,anon,authenticated,service_role',t);
end loop;end$$;

create function ar_private.financial_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'financial_immutable';end$$;
create trigger financial_commands_immutable before update or delete on ar_private.financial_commands for each row execute function ar_private.financial_immutable();
create trigger financial_changes_immutable before update or delete on ar_private.financial_changes for each row execute function ar_private.financial_immutable();
create trigger financial_publications_immutable before update or delete on ar_private.financial_publications for each row execute function ar_private.financial_immutable();
create trigger financial_batches_immutable before update on ar_private.financial_stage_batches for each row execute function ar_private.financial_immutable();

create function ar_private.financial_run_json(r ar_private.financial_runs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'owner',r.owner,'hotel',r.hotel,'from',r.source_from,'to',r.source_to,'status',r.status,'proof',r.proof,'discovered',r.discovered,'accounts',r.account_count,'startedAt',r.started_at,'initialImport',r.initial_import,
 'counts',jsonb_build_object('invoices',r.invoice_count,'payments',r.payment_count,'applications',r.application_count));
$$;
create function ar_private.financial_receipt(r ar_private.financial_runs,p_created boolean) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'hotel',r.hotel,'from',r.source_from,'to',r.source_to,'status',r.status,'created',p_created);
$$;
create function ar_private.financial_require_run(p_actor uuid,p_run uuid,p_active boolean default true) returns ar_private.financial_runs language plpgsql set search_path='' as $$
declare r ar_private.financial_runs;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 select * into r from ar_private.financial_runs where id=p_run and owner=p_actor for update;
 if not found then raise exception 'financial_run_missing';end if;
 if p_active and (r.status<>'running' or r.lease_until is null or r.lease_until<=clock_timestamp()) then raise exception 'financial_lease_invalid';end if;
 return r;
end$$;
create function public.ar_financial_command_get(p_actor uuid,p_command uuid,p_request jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c ar_private.financial_commands;r ar_private.financial_runs;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 select * into c from ar_private.financial_commands where owner=p_actor and command_id=p_command;if not found then return null;end if;
 if c.request is distinct from p_request then raise exception 'financial_command_conflict';end if;
 select * into r from ar_private.financial_runs where id=c.run_id;return ar_private.financial_receipt(r,false);
end$$;
create function public.ar_financial_request(p_actor uuid,p_command uuid,p_request jsonb,p_from date,p_to date,p_proof text,p_stale_minutes integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;prior jsonb;h text;created boolean:=false;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_command is null or jsonb_typeof(p_request) is distinct from 'object' or p_request-array['hotel','reason','from','to']<>'{}'::jsonb
  or not(p_request?&array['hotel','reason','from','to']) or p_request->>'hotel' not in('KAT','TSK') or p_request->>'hotel' is null
  or p_request->>'reason' not in('manual','scheduled','backfill','open') or p_request->>'reason' is null then raise exception 'financial_invalid';end if;
 h:=p_request->>'hotel';perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_command::text,947));
 prior:=public.ar_financial_command_get(p_actor,p_command,p_request);if prior is not null then return prior;end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>=366 or p_proof is null or p_proof!~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$' then raise exception 'financial_invalid';end if;
 if (p_request->'from'='null'::jsonb)<>(p_request->'to'='null'::jsonb) or p_request->>'reason'='backfill' and p_request->'from'='null'::jsonb then raise exception 'financial_invalid';end if;
 if p_request->'from'<>'null'::jsonb and (jsonb_typeof(p_request->'from')<>'string' or jsonb_typeof(p_request->'to')<>'string' or p_request->>'from'<>to_char(p_from,'YYYY-MM-DD') or p_request->>'to'<>to_char(p_to,'YYYY-MM-DD')) then raise exception 'financial_invalid';end if;
 perform pg_advisory_xact_lock(61747,case h when 'KAT' then 1 else 2 end);
 update ar_private.financial_runs set status='failed',error_code='financial_lease_expired',lease_until=null,finished_at=clock_timestamp() where hotel=h and status='running' and lease_until<=clock_timestamp();
 if p_stale_minutes is null or p_stale_minutes not between 1 and 2147483647 then raise exception 'financial_invalid';end if;
 if p_request->>'reason'='open' then
  select * into r from ar_private.financial_runs where owner=p_actor and hotel=h and status='succeeded' and source_from<=p_from and source_to>=p_to and proof=p_proof and finished_at>=clock_timestamp()-make_interval(mins=>p_stale_minutes) order by finished_at desc limit 1;
  if found then insert into ar_private.financial_commands values(p_actor,p_command,p_request,r.id);return ar_private.financial_receipt(r,false);end if;
 end if;
 select * into r from ar_private.financial_runs where owner=p_actor and hotel=h and source_from=p_from and source_to=p_to and proof=p_proof and status in('queued','running') order by created_at,id limit 1;
 if not found then
  insert into ar_private.financial_runs(owner,hotel,source_from,source_to,reason,proof,initial_import)
  values(p_actor,h,p_from,p_to,p_request->>'reason',p_proof,not exists(select 1 from ar_private.financial_publications where hotel=h)) returning * into r;created:=true;
 end if;
 insert into ar_private.financial_commands(owner,command_id,request,run_id) values(p_actor,p_command,p_request,r.id);
 return ar_private.financial_receipt(r,created);
end$$;
create function public.ar_financial_run_get(p_actor uuid,p_run_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r ar_private.financial_runs;
begin if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor;if not found then raise exception 'financial_run_missing';end if;return ar_private.financial_run_json(r);end$$;
create function public.ar_financial_claim(p_actor uuid,p_run_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor;if not found then raise exception 'financial_run_missing';end if;
 perform pg_advisory_xact_lock(61747,case r.hotel when 'KAT' then 1 else 2 end);
 update ar_private.financial_runs set status='failed',error_code='financial_lease_expired',lease_until=null,finished_at=clock_timestamp() where hotel=r.hotel and status='running' and lease_until<=clock_timestamp();
 select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor for update;
 if r.status='running' and r.lease_until>clock_timestamp() then return true;end if;
 if r.status<>'queued' then raise exception 'financial_run_failed';end if;
 if exists(select 1 from ar_private.financial_runs where hotel=r.hotel and status='running') then return false;end if;
 update ar_private.financial_runs set status='running',started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '30 minutes' where id=p_run_id;return true;
end$$;
create function public.ar_financial_renew(p_actor uuid,p_run_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;update ar_private.financial_runs set lease_until=clock_timestamp()+interval '30 minutes' where id=p_run_id and owner=p_actor and status='running' and lease_until>clock_timestamp();return found;end$$;
create function public.ar_financial_discovery_set(p_actor uuid,p_run_id uuid,p_accounts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;prior text[];
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 if p_accounts is null or coalesce(array_ndims(p_accounts),1)<>1 or cardinality(p_accounts)<>(select count(distinct id) from unnest(p_accounts) id)
  or exists(select 1 from unnest(p_accounts) id where id is null or length(id) not between 1 and 200 or id<>btrim(id) or id~'[[:cntrl:]]') then raise exception 'financial_discovery_invalid';end if;
 if r.discovered then select coalesce(array_agg(account_id order by account_id),'{}'::text[]) into prior from ar_private.financial_run_accounts where run_id=p_run_id;
  if prior is distinct from array(select id from unnest(p_accounts) id order by id) then raise exception 'financial_discovery_changed';end if;
 else
  insert into ar_private.financial_run_accounts(run_id,account_id,ordinal) select p_run_id,id,(ordinal-1)::integer from unnest(p_accounts) with ordinality a(id,ordinal);
  update ar_private.financial_runs set discovered=true,account_count=cardinality(p_accounts) where id=p_run_id;
 end if;
 return jsonb_build_object('accounts',cardinality(p_accounts));
end$$;
create function public.ar_financial_account_get(p_actor uuid,p_run_id uuid,p_ordinal integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a ar_private.financial_run_accounts;
begin
 if not ar_private.financial_actor(p_actor) or not exists(select 1 from ar_private.financial_runs where id=p_run_id and owner=p_actor) then raise exception 'financial_forbidden';end if;
 select * into a from ar_private.financial_run_accounts where run_id=p_run_id and ordinal=p_ordinal;if not found then raise exception 'financial_account_missing';end if;
 return jsonb_build_object('ordinal',a.ordinal,'accountId',a.account_id,'staged',a.staged,'counts',coalesce(a.counts,'{"invoices":0,"payments":0,"applications":0}'::jsonb));
end$$;

create function ar_private.financial_row_valid(p_kind text,v jsonb,p_hotel text,p_account text) returns boolean language plpgsql immutable set search_path='' as $$
declare allowed text[];amounts text[];dates text[];k text;d date;
begin
 if jsonb_typeof(v) is distinct from 'object' or v->>'hotel' is distinct from p_hotel or v->>'accountId' is distinct from p_account then return false;end if;
 if p_kind='application' then
  allowed:=array['hotel','accountId','invoiceTransactionId','paymentTransactionId','invoiceNo','appliedAmount','currency','invoiceTransactionDate','invoicePostingDate','invoiceCloseDate','applicationDate','applicationEventId'];
  amounts:=array['appliedAmount'];dates:=array['invoiceTransactionDate','invoicePostingDate','invoiceCloseDate'];
  if jsonb_typeof(v->'invoiceTransactionId') is distinct from 'string' or v->>'invoiceTransactionId'!~'^[1-9][0-9]{0,79}$'
   or jsonb_typeof(v->'paymentTransactionId') is distinct from 'string' or v->>'paymentTransactionId'!~'^[1-9][0-9]{0,79}$'
   or v->'applicationDate' is distinct from 'null'::jsonb or v->'applicationEventId' is distinct from 'null'::jsonb then return false;end if;
 else
  allowed:=array['hotel','accountId','kind','transactionId','transactionDate','postingDate','revenueDate','transferDate','currency','transferredIn','transferredOut'];
  dates:=array['transactionDate','postingDate','revenueDate','transferDate'];
  if v->>'kind' is distinct from p_kind or jsonb_typeof(v->'transactionId') is distinct from 'string' or length(v->>'transactionId')>80 or v->>'transactionId'!~'^-?(0|[1-9][0-9]*)$'
   or v->>'transactionId'='-0' or (v->>'transactionId')::numeric<=0 and not(p_kind='invoice' and coalesce(v->>'invoiceType','')='OldBalance') then return false;end if;
  foreach k in array array['transferredIn','transferredOut'] loop if v->k is distinct from 'null'::jsonb and jsonb_typeof(v->k) is distinct from 'boolean' then return false;end if;end loop;
  if p_kind='invoice' then
   allowed:=allowed||array['invoiceNo','folioNo','invoiceType','originalAmount','currentAmount','cumulativePayments','openAmount','closeDate','compressed','parentInvoiceNo','collectionRole','entryClassification'];
   amounts:=array['originalAmount','currentAmount','cumulativePayments','openAmount'];dates:=dates||'closeDate'::text;
   if v->'invoiceType' is distinct from 'null'::jsonb and v->>'invoiceType' not in('Normal','Credit','OldBalance','PasserBy') or v->>'collectionRole' not in('standalone','parent','child','unverified') or v->>'entryClassification' not in('invoice','credit','opening_balance','unclassified') then return false;end if;
   if v->'compressed' is distinct from 'null'::jsonb and jsonb_typeof(v->'compressed') is distinct from 'boolean' then return false;end if;
   if v->>'entryClassification' is distinct from (case v->>'invoiceType' when 'OldBalance' then 'opening_balance' when 'Credit' then 'credit' when 'Normal' then 'invoice' when 'PasserBy' then 'invoice' else 'unclassified' end) then return false;end if;
   if v->'parentInvoiceNo'<>'null'::jsonb and (v->>'parentInvoiceNo'!~'^[1-9][0-9]{0,79}$' or v->'compressed'='true'::jsonb) then return false;end if;
   if v->>'collectionRole' is distinct from (case when v->'parentInvoiceNo'<>'null'::jsonb then 'child' when v->'compressed'='true'::jsonb then 'parent' when v->'compressed'='false'::jsonb then 'standalone' else 'unverified' end) then return false;end if;
  elsif p_kind='payment' then
   allowed:=allowed||array['transactionCode','amount','appliedAmount','unallocatedAmount','transfer','classification','reversal'];amounts:=array['amount','appliedAmount','unallocatedAmount'];
   if v->>'classification' is distinct from 'unknown' or v->>'reversal' is distinct from 'unknown' or v->>'transfer' not in('in','out','both','none_reported','unknown') then return false;end if;
   if v->>'transfer' is distinct from (case when v->'transferredIn'='true'::jsonb and v->'transferredOut'='true'::jsonb then 'both' when v->'transferredIn'='true'::jsonb then 'in' when v->'transferredOut'='true'::jsonb then 'out' when v->'transferredIn'='false'::jsonb and v->'transferredOut'='false'::jsonb then 'none_reported' else 'unknown' end) then return false;end if;
  else return false;end if;
 end if;
 if v-allowed<>'{}'::jsonb or not(v?&allowed) then return false;end if;
 if v->'currency' is distinct from 'null'::jsonb and v->>'currency' is distinct from 'THB' then return false;end if;
 foreach k in array amounts loop
  if v->k<>'null'::jsonb and (v->>'currency' is distinct from 'THB' or jsonb_typeof(v->k) is distinct from 'string' or length(v->>k)>82 or v->>k!~'^-?(0|[1-9][0-9]*)\.[0-9]{2}$') then return false;end if;
 end loop;
 foreach k in array dates loop
  if v->k<>'null'::jsonb then
   if jsonb_typeof(v->k) is distinct from 'string' or v->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
   d:=(v->>k)::date;if to_char(d,'YYYY-MM-DD')<>v->>k then return false;end if;
  end if;
 end loop;
 foreach k in array array['invoiceNo','folioNo','parentInvoiceNo','transactionCode'] loop if v?k and v->k<>'null'::jsonb and (jsonb_typeof(v->k) is distinct from 'string' or length(v->>k)>200 or v->>k~'[[:cntrl:]]') then return false;end if;end loop;
 return true;
exception when others then return false;
end$$;
create function public.ar_financial_stage_batch(p_actor uuid,p_run_id uuid,p_account text,p_kind text,p_batch integer,p_rows jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;prior jsonb;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 if not r.discovered or not exists(select 1 from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account) then raise exception 'financial_account_missing';end if;
 if p_kind is null or p_kind not in('invoice','payment','application') or p_batch is null or p_batch<0 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'financial_invalid';end if;
 if jsonb_array_length(p_rows) not between 1 and 500 or exists(select 1 from jsonb_array_elements(p_rows) v where not ar_private.financial_row_valid(p_kind,v,r.hotel,p_account)) then raise exception 'financial_row_invalid';end if;
 select rows into prior from ar_private.financial_stage_batches where run_id=p_run_id and account_id=p_account and kind=p_kind and batch=p_batch;
 if found then if prior is distinct from p_rows then raise exception 'financial_batch_conflict';end if;return true;end if;
 if exists(select 1 from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account and staged) then raise exception 'financial_account_staged';end if;
 insert into ar_private.financial_stage_batches(run_id,account_id,kind,batch,rows) values(p_run_id,p_account,p_kind,p_batch,p_rows);return true;
end$$;
create function public.ar_financial_account_done(p_actor uuid,p_run_id uuid,p_account text,p_context jsonb,p_counts jsonb,p_coverage jsonb,p_mapping_invoices text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;a ar_private.financial_run_accounts;actual jsonb;dupes bigint;k text;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account;if not found then raise exception 'financial_account_missing';end if;
 if a.staged then if a.context is distinct from p_context or a.counts is distinct from p_counts or a.coverage is distinct from p_coverage or a.mapping_invoices is distinct from p_mapping_invoices then raise exception 'financial_batch_conflict';end if;return a.counts;end if;
 if jsonb_typeof(p_context) is distinct from 'object' or p_context-array['name','type','accountNo']<>'{}'::jsonb or not(p_context?&array['name','type','accountNo'])
  or jsonb_typeof(p_context->'name') is distinct from 'string' or jsonb_typeof(p_context->'type') is distinct from 'string'
  or length(btrim(p_context->>'name')) not between 1 and 1000 or length(btrim(p_context->>'type')) not between 1 and 200
  or length(p_context->>'name')>1000 or length(p_context->>'type')>200 or p_context->>'name'~'[[:cntrl:]]' or p_context->>'type'~'[[:cntrl:]]'
  or p_context->'accountNo'<>'null'::jsonb and (jsonb_typeof(p_context->'accountNo')<>'string' or length(p_context->>'accountNo')>200) then raise exception 'financial_context_invalid';end if;
 if jsonb_typeof(p_coverage) is distinct from 'object' or p_coverage->>'pagination' is distinct from 'complete' or p_coverage->'query'->>'hotel' is distinct from r.hotel
  or p_coverage->'query'->>'accountId' is distinct from p_account or p_coverage->'query'->>'start' is distinct from to_char(r.source_from,'YYYY-MM-DD')
  or p_coverage->'query'->>'end' is distinct from to_char(r.source_to,'YYYY-MM-DD') or p_coverage->'query'->'kinds' is distinct from '["invoice","payment"]'::jsonb
  or p_coverage->'roots' is distinct from p_coverage->'reportedRoots' then raise exception 'financial_coverage_invalid';end if;
 if p_coverage-array['query','observedAt','pagination','pages','members','roots','reportedRoots','dateSemantics','financialClassification','completeForFinancialPeriod','missingTransactionDates','outsideRequestedTransactionDates','unknownPrimaryAmounts','mappingVerified','mappingContractVersion']<>'{}'::jsonb
  or p_coverage->>'dateSemantics' is distinct from 'unverified' or p_coverage->>'financialClassification' is distinct from 'unverified' or p_coverage->'completeForFinancialPeriod' is distinct from 'false'::jsonb
  or jsonb_typeof(p_coverage->'observedAt') is distinct from 'string' then raise exception 'financial_coverage_invalid';end if;
 foreach k in array array['pages','members','roots','reportedRoots','missingTransactionDates','outsideRequestedTransactionDates','unknownPrimaryAmounts'] loop
  if jsonb_typeof(p_coverage->k) is distinct from 'number' or p_coverage->>k!~'^(0|[1-9][0-9]{0,9})$' then raise exception 'financial_coverage_invalid';end if;
 end loop;
 if p_coverage->>'mappingContractVersion' is distinct from 'correlated_v1' or p_coverage->'mappingVerified' is distinct from to_jsonb(cardinality(p_mapping_invoices)) then raise exception 'financial_mapping_proof_missing';end if;
 if p_mapping_invoices is null or cardinality(p_mapping_invoices)<>(select count(distinct id) from unnest(p_mapping_invoices) id) then raise exception 'financial_mapping_invalid';end if;
 with all_rows as (select b.kind,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account)
 select jsonb_build_object('invoices',count(*) filter(where kind='invoice'),'payments',count(*) filter(where kind='payment'),'applications',count(*) filter(where kind='application')),
  count(*)-count(distinct (kind,case when kind='application' then (v->>'invoiceTransactionId')||':'||(v->>'paymentTransactionId') else v->>'transactionId' end)) into actual,dupes from all_rows;
 if actual is distinct from p_counts or dupes<>0 then raise exception 'financial_stage_incomplete';end if;
 if exists(select 1 from ar_private.financial_stage_batches where run_id=p_run_id and account_id=p_account group by kind having min(batch)<>0 or max(batch)+1<>count(*)) then raise exception 'financial_stage_incomplete';end if;
 if (p_coverage->>'members')::bigint<>(actual->>'invoices')::bigint+(actual->>'payments')::bigint then raise exception 'financial_coverage_invalid';end if;
 if exists(select 1 from unnest(p_mapping_invoices) id where not exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and v->>'transactionId'=id and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent')))
  or exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account and b.kind='application' and not(v->>'invoiceTransactionId'=any(p_mapping_invoices))) then raise exception 'financial_mapping_invalid';end if;
 if exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent') and not(v->>'transactionId'=any(p_mapping_invoices))) then raise exception 'financial_mapping_invalid';end if;
 -- The service writer cannot publish an empty/partial mapping against a known paid invoice.
 if exists(
  select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) i
  where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and i->>'transactionId'=any(p_mapping_invoices)
  and ((i->>'currentAmount') is null or (i->>'openAmount') is null or (i->>'cumulativePayments') is null
   or coalesce((select sum((allocation_entry->>'appliedAmount')::numeric) from ar_private.financial_stage_batches ab cross join lateral jsonb_array_elements(ab.rows) allocation_entry where ab.run_id=p_run_id and ab.account_id=p_account and ab.kind='application' and allocation_entry->>'invoiceTransactionId'=i->>'transactionId'),0)<> (i->>'currentAmount')::numeric-(i->>'openAmount')::numeric
   or abs((i->>'cumulativePayments')::numeric)<>abs((i->>'currentAmount')::numeric-(i->>'openAmount')::numeric))
 ) then raise exception 'financial_mapping_total';end if;
 update ar_private.financial_run_accounts set staged=true,context=p_context,counts=p_counts,coverage=p_coverage,mapping_invoices=p_mapping_invoices,staged_at=clock_timestamp() where run_id=p_run_id and account_id=p_account;
 return actual;
end$$;

create function ar_private.financial_change_capture() returns trigger language plpgsql set search_path='' as $$
declare k text;identity text;
begin
 k:=case tg_table_name when 'financial_invoice_entries' then 'invoice' when 'financial_payments' then 'payment' else 'application' end;
 if k='application' then identity:=new.invoice_id||':'||new.payment_id;else identity:=new.transaction_id;end if;
 if tg_op='INSERT' or old.source_data is distinct from new.source_data or old.source_status is distinct from new.source_status then
  insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,previous_data,next_data,previous_status,next_status,observed_at)
  values(new.run_id,new.hotel,new.account_id,k,identity,case when tg_op='INSERT' then null else old.source_data end,new.source_data,case when tg_op='INSERT' then null else old.source_status end,new.source_status,new.last_checked_at);
 end if;return new;
end$$;
create trigger financial_invoice_changes after insert or update on ar_private.financial_invoice_entries for each row execute function ar_private.financial_change_capture();
create trigger financial_payment_changes after insert or update on ar_private.financial_payments for each row execute function ar_private.financial_change_capture();
create trigger financial_application_changes after insert or update on ar_private.financial_applications for each row execute function ar_private.financial_change_capture();

create function public.ar_financial_publish(p_actor uuid,p_run_id uuid,p_accounts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;expected text[];published timestamptz:=clock_timestamp();n_invoice bigint;n_payment bigint;n_application bigint;initial boolean;complete boolean;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor;if not found then raise exception 'financial_run_missing';end if;
 perform pg_advisory_xact_lock(61747,case r.hotel when 'KAT' then 1 else 2 end);
 select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor for update;
 if r.status='succeeded' then return jsonb_build_object('status','succeeded','accounts',r.account_count,'invoices',r.invoice_count,'payments',r.payment_count,'applications',r.application_count);end if;
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 select coalesce(array_agg(account_id order by account_id),'{}'::text[]) into expected from ar_private.financial_run_accounts where run_id=p_run_id;
 if not r.discovered or p_accounts is null or cardinality(p_accounts)<>r.account_count or cardinality(p_accounts)<>(select count(distinct id) from unnest(p_accounts) id)
  or expected is distinct from array(select id from unnest(p_accounts) id order by id) or exists(select 1 from ar_private.financial_run_accounts where run_id=p_run_id and not staged) then raise exception 'financial_stage_incomplete';end if;
 select coalesce(sum((counts->>'invoices')::bigint),0),coalesce(sum((counts->>'payments')::bigint),0),coalesce(sum((counts->>'applications')::bigint),0),
  coalesce(bool_and((coverage->>'missingTransactionDates')::integer=0 and (coverage->>'outsideRequestedTransactionDates')::integer=0),true)
 into n_invoice,n_payment,n_application,complete from ar_private.financial_run_accounts where run_id=p_run_id;
 initial:=not exists(select 1 from ar_private.financial_publications where hotel=r.hotel);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,account_no,observed_at,run_id)
 select r.hotel,account_id,context->>'name',context->>'type',context->>'accountNo',published,p_run_id from ar_private.financial_run_accounts where run_id=p_run_id
 on conflict(hotel,account_id) do update set name=excluded.name,type=excluded.type,account_no=excluded.account_no,observed_at=excluded.observed_at,run_id=excluded.run_id;

 insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,cumulative_payments,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select r.hotel,b.account_id,v->>'transactionId',(v->>'transactionDate')::date,(v->>'originalAmount')::numeric,(v->>'currentAmount')::numeric,(v->>'cumulativePayments')::numeric,(v->>'openAmount')::numeric,v,'observed',published,published,published,p_run_id
 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.kind='invoice'
 on conflict(hotel,account_id,transaction_id) do update set source_date=excluded.source_date,original_amount=excluded.original_amount,current_amount=excluded.current_amount,cumulative_payments=excluded.cumulative_payments,open_amount=excluded.open_amount,source_data=excluded.source_data,source_status='observed',last_observed_at=excluded.last_observed_at,last_checked_at=excluded.last_checked_at,run_id=excluded.run_id;
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select r.hotel,b.account_id,v->>'transactionId',(v->>'transactionDate')::date,(v->>'amount')::numeric,(v->>'appliedAmount')::numeric,(v->>'unallocatedAmount')::numeric,v,'observed',published,published,published,p_run_id
 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.kind='payment'
 on conflict(hotel,account_id,transaction_id) do update set source_date=excluded.source_date,amount=excluded.amount,applied_amount=excluded.applied_amount,unallocated_amount=excluded.unallocated_amount,source_data=excluded.source_data,source_status='observed',last_observed_at=excluded.last_observed_at,last_checked_at=excluded.last_checked_at,run_id=excluded.run_id;
 insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,application_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select r.hotel,b.account_id,v->>'invoiceTransactionId',v->>'paymentTransactionId',(v->>'appliedAmount')::numeric,(v->>'invoiceTransactionDate')::date,null,v,'observed',published,published,published,p_run_id
 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.kind='application'
 on conflict(hotel,account_id,invoice_id,payment_id) do update set applied_amount=excluded.applied_amount,invoice_date=excluded.invoice_date,source_data=excluded.source_data,source_status='observed',last_observed_at=excluded.last_observed_at,last_checked_at=excluded.last_checked_at,run_id=excluded.run_id;

 -- Absence is an observation failure, never a generated zero, reversal or deletion.
 update ar_private.financial_invoice_entries set source_status='not_observed',last_checked_at=published,run_id=p_run_id
 where hotel=r.hotel and source_date between r.source_from and r.source_to and run_id<>p_run_id;
 update ar_private.financial_payments set source_status='not_observed',last_checked_at=published,run_id=p_run_id
 where hotel=r.hotel and source_date between r.source_from and r.source_to and run_id<>p_run_id;
 update ar_private.financial_applications f set source_status='not_observed',last_checked_at=published,run_id=p_run_id
 where f.hotel=r.hotel and f.run_id<>p_run_id and (
  exists(select 1 from ar_private.financial_run_accounts a where a.run_id=p_run_id and a.account_id=f.account_id and f.invoice_id=any(a.mapping_invoices))
  or exists(select 1 from ar_private.financial_invoice_entries i where i.hotel=f.hotel and i.account_id=f.account_id and i.transaction_id=f.invoice_id and i.run_id=p_run_id and i.source_status='not_observed')
  or exists(select 1 from ar_private.financial_payments p where p.hotel=f.hotel and p.account_id=f.account_id and p.transaction_id=f.payment_id and p.run_id=p_run_id and p.source_status='not_observed')
 );
 insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
 values(p_run_id,r.hotel,r.source_from,r.source_to,published,r.account_count,n_invoice,n_payment,n_application,initial,complete,r.proof);
 update ar_private.financial_runs set status='succeeded',initial_import=initial,invoice_count=n_invoice,payment_count=n_payment,application_count=n_application,finished_at=published,lease_until=null,error_code=null where id=p_run_id;
 delete from ar_private.financial_stage_batches where run_id=p_run_id;
 return jsonb_build_object('status','succeeded','accounts',r.account_count,'invoices',n_invoice,'payments',n_payment,'applications',n_application);
end$$;
create function public.ar_financial_fail(p_actor uuid,p_run_id uuid,p_code text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_code is null or p_code!~'^[a-z][a-z_]{0,99}$' then raise exception 'financial_invalid';end if;
 update ar_private.financial_runs set status='failed',error_code=p_code,lease_until=null,finished_at=clock_timestamp() where id=p_run_id and owner=p_actor and status in('queued','running');
 if not found then return false;end if;delete from ar_private.financial_stage_batches where run_id=p_run_id;return true;
end$$;

create view ar_private.financial_report_rows as
 select 'invoice_entries'::text as view_name,i.hotel,i.account_id,c.type as account_type,i.source_date,i.original_amount as amount,
  i.source_data->>'entryClassification'='invoice' and i.source_data->>'collectionRole' in('standalone','parent') as measured,
  i.transaction_id as invoice_id,null::text as payment_id,i.source_status,
  i.source_data||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',i.source_status,'firstObservedAt',i.first_observed_at,'lastObservedAt',i.last_observed_at,'lastCheckedAt',i.last_checked_at) as row_json
 from ar_private.financial_invoice_entries i join ar_private.financial_accounts c on c.hotel=i.hotel and c.account_id=i.account_id
 union all
 select 'payments',p.hotel,p.account_id,c.type,p.source_date,p.amount,true,null,p.transaction_id,p.source_status,
  p.source_data||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',p.source_status,'firstObservedAt',p.first_observed_at,'lastObservedAt',p.last_observed_at,'lastCheckedAt',p.last_checked_at)
 from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id
 union all
 select 'applications',a.hotel,a.account_id,c.type,i.source_date,a.applied_amount,true,a.invoice_id,a.payment_id,a.source_status,
  a.source_data||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',a.source_status,'firstObservedAt',a.first_observed_at,'lastObservedAt',a.last_observed_at,'lastCheckedAt',a.last_checked_at,'invoiceTransactionDate',i.source_date,'paymentTransactionDate',p.source_date,'paymentSourceStatus',p.source_status)
 from ar_private.financial_applications a join ar_private.financial_accounts c on c.hotel=a.hotel and c.account_id=a.account_id
 join ar_private.financial_invoice_entries i on i.hotel=a.hotel and i.account_id=a.account_id and i.transaction_id=a.invoice_id
 left join ar_private.financial_payments p on p.hotel=a.hotel and p.account_id=a.account_id and p.transaction_id=a.payment_id;
revoke all on ar_private.financial_report_rows from public,anon,authenticated,service_role;
create function public.ar_financial_report(p_actor uuid,p_view text,p_hotel text default null,p_account text default null,p_type text default null,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;complete boolean:=false;last_success timestamptz;last_status text;last_error text;summary jsonb;known numeric;unknowns bigint;unclassified bigint;measured_count bigint;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_view is null or p_view not in('invoice_entries','payments','applications','coverage','options') or p_hotel is not null and p_hotel not in('KAT','TSK')
  or p_account is not null and (p_hotel is null or length(p_account) not between 1 and 200) or p_type is not null and length(p_type)>200
  or (p_from is null)<>(p_to is null) or p_from>p_to or p_to-p_from>3660 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then raise exception 'financial_invalid';end if;
 if p_from is not null and p_to is not null then
  select not exists(
   select 1 from (values('KAT'::text),('TSK'::text)) h(hotel) cross join generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') day
   where (p_hotel is null or h.hotel=p_hotel) and not exists(select 1 from ar_private.financial_publications p where p.hotel=h.hotel and p.period_complete and day::date between p.source_from and p.source_to)
  ) into complete;
 end if;
 -- Application coverage is a current snapshot for the selected invoice-date cohort; it is not application-day activity.
 select max(published_at) into last_success from ar_private.financial_publications where p_hotel is null or hotel=p_hotel;
 select status,error_code into last_status,last_error from ar_private.financial_runs where p_hotel is null or hotel=p_hotel order by created_at desc,id desc limit 1;
 summary:=jsonb_build_object('rows',0,'measuredRows',0,'knownAmount','0.00','amount',null,'unknownAmounts',0,'notObserved',0,'unknownSourceDates',0,'compressedChildren',0,'openingBalances',0,'credits',0,'invoiceCount',0,'paymentCount',0,
  'amountBasis',case p_view when 'invoice_entries' then 'original_invoice_amount' when 'payments' then 'signed_payment_posting' when 'applications' then 'current_observed_application' else 'none' end,
  'dateBasis',case p_view when 'invoice_entries' then 'invoice_transaction_date' when 'payments' then 'payment_transaction_date' when 'applications' then 'invoice_transaction_date' when 'coverage' then 'publication_date' else 'none' end,
  'receiptClassification','unknown','applicationDatesVerified',false,'coverageComplete',complete);
 if p_view='options' then
  with filtered as materialized(select hotel,account_id,name,type,account_no from ar_private.financial_accounts where (p_hotel is null or hotel=p_hotel) and (p_account is null or account_id=p_account) and (p_type is null or type=p_type))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',f.hotel,'accountId',f.account_id,'name',f.name,'type',f.type,'accountNo',f.account_no) order by f.hotel,f.name,f.account_id) from (select * from filtered order by hotel,name,account_id offset p_offset limit p_limit) f),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 elsif p_view='coverage' then
  with filtered as materialized(select p.* from ar_private.financial_publications p where (p_hotel is null or p.hotel=p_hotel) and (p_from is null or p.source_to>=p_from and p.source_from<=p_to)
   and (p_account is null and p_type is null or exists(select 1 from ar_private.financial_run_accounts a where a.run_id=p.run_id and (p_account is null or a.account_id=p_account) and (p_type is null or a.context->>'type'=p_type))))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',f.run_id,'hotel',f.hotel,'from',f.source_from,'to',f.source_to,'publishedAt',f.published_at,'accounts',f.accounts,'invoices',f.invoices,'payments',f.payments,'applications',f.applications,'initialImport',f.initial_import,'periodComplete',f.period_complete,'proof',f.proof) order by f.published_at desc,f.run_id) from (select * from filtered order by published_at desc,run_id offset p_offset limit p_limit) f),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 else
  with filtered as materialized(
   select *,measured and source_status='observed' and (p_from is null or source_date is not null) as included
   from ar_private.financial_report_rows where view_name=p_view and (p_hotel is null or hotel=p_hotel) and (p_account is null or account_id=p_account) and (p_type is null or account_type=p_type)
    and (p_from is null or source_date is null or source_date between p_from and p_to)
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(row_json order by source_date desc nulls last,hotel,account_id,invoice_id,payment_id) from (select * from filtered order by source_date desc nulls last,hotel,account_id,invoice_id,payment_id offset p_offset limit p_limit) page),'[]'::jsonb),'total',(select count(*) from filtered)),
   coalesce(sum(amount) filter(where included),0),count(*) filter(where measured and (amount is null or not included)),count(*) filter(where p_view='invoice_entries' and (row_json->>'entryClassification'='unclassified' or row_json->>'entryClassification'='invoice' and row_json->>'collectionRole'='unverified')),count(*) filter(where included),
   jsonb_build_object('rows',count(*),'measuredRows',count(*) filter(where included),'unknownAmounts',count(*) filter(where measured and (amount is null or not included)),'notObserved',count(*) filter(where source_status='not_observed'),'unknownSourceDates',count(*) filter(where source_date is null),
    'compressedChildren',count(*) filter(where row_json->>'collectionRole'='child'),'openingBalances',count(*) filter(where row_json->>'entryClassification'='opening_balance'),'credits',count(*) filter(where row_json->>'entryClassification'='credit'),
    'invoiceCount',count(distinct (hotel,account_id,invoice_id)) filter(where included and invoice_id is not null),'paymentCount',count(distinct (hotel,account_id,payment_id)) filter(where included and payment_id is not null))
  into result,known,unknowns,unclassified,measured_count,summary from filtered;
  summary:=summary||jsonb_build_object('knownAmount',ar_private.financial_money(known),'amount',case when complete and unknowns=0 and unclassified=0 then ar_private.financial_money(known) else null end,
   'unknownAmounts',unknowns+unclassified,'amountBasis',case p_view when 'invoice_entries' then 'original_invoice_amount' when 'payments' then 'signed_payment_posting' else 'current_observed_application' end,
   'dateBasis',case p_view when 'invoice_entries' then 'invoice_transaction_date' when 'payments' then 'payment_transaction_date' else 'invoice_transaction_date' end,'receiptClassification','unknown','applicationDatesVerified',false,'coverageComplete',complete);
 end if;
 if p_view='payments' then
  with matched as materialized(
   select p.* from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id
   where (p_hotel is null or p.hotel=p_hotel) and (p_account is null or p.account_id=p_account) and (p_type is null or c.type=p_type)
    and (p_from is null or p.source_date is null or p.source_date between p_from and p_to)
  ) select summary||jsonb_build_object('paymentTotals',jsonb_build_object(
   'creditPostings',case when complete and count(*) filter(where source_status<>'observed' or amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(-sum(amount) filter(where amount<0),0)) end,
   'debitPostings',case when complete and count(*) filter(where source_status<>'observed' or amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(sum(amount) filter(where amount>0),0)) end,
   'currentlyApplied',case when complete and count(*) filter(where source_status<>'observed' or applied_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(-sum(applied_amount),0)) end,
   'currentlyUnallocated',case when complete and count(*) filter(where source_status<>'observed' or unallocated_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(-sum(unallocated_amount),0)) end,
   'transferRows',count(*) filter(where source_data->>'transfer' in('in','out','both')),
   'unknownTransferRows',count(*) filter(where source_data->>'transfer'='unknown')
  )) into summary from matched;
 end if;
 return result||jsonb_build_object('view',p_view,'summary',summary,'coverage',jsonb_build_object('complete',complete,'from',p_from,'to',p_to,'lastSuccessAt',last_success,'lastAttemptStatus',last_status,'lastError',last_error));
end$$;

revoke all on function ar_private.financial_actor(uuid),ar_private.financial_money(numeric),ar_private.financial_immutable(),ar_private.financial_run_json(ar_private.financial_runs),ar_private.financial_receipt(ar_private.financial_runs,boolean),ar_private.financial_require_run(uuid,uuid,boolean),ar_private.financial_row_valid(text,jsonb,text,text),ar_private.financial_change_capture() from public,anon,authenticated,service_role;
revoke all on function public.ar_financial_command_get(uuid,uuid,jsonb),public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer),public.ar_financial_run_get(uuid,uuid),public.ar_financial_claim(uuid,uuid),public.ar_financial_renew(uuid,uuid),public.ar_financial_discovery_set(uuid,uuid,text[]),public.ar_financial_account_get(uuid,uuid,integer),public.ar_financial_stage_batch(uuid,uuid,text,text,integer,jsonb),public.ar_financial_account_done(uuid,uuid,text,jsonb,jsonb,jsonb,text[]),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text),public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_financial_command_get(uuid,uuid,jsonb),public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer),public.ar_financial_run_get(uuid,uuid),public.ar_financial_claim(uuid,uuid),public.ar_financial_renew(uuid,uuid),public.ar_financial_discovery_set(uuid,uuid,text[]),public.ar_financial_account_get(uuid,uuid,integer),public.ar_financial_stage_batch(uuid,uuid,text,text,integer,jsonb),public.ar_financial_account_done(uuid,uuid,text,jsonb,jsonb,jsonb,text[]),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text),public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer) to service_role;

create function public.ar_financial_status(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 return jsonb_build_object('runs',coalesce((select jsonb_agg(ar_private.financial_run_json(r)||jsonb_build_object('finishedAt',r.finished_at,'error',r.error_code)) from (select * from ar_private.financial_runs where owner=p_actor order by created_at desc,id desc limit 10) r),'[]'::jsonb),'running',exists(select 1 from ar_private.financial_runs where owner=p_actor and status in('queued','running')));
end$$;
revoke all on function public.ar_financial_status(uuid) from public,anon,authenticated;
grant execute on function public.ar_financial_status(uuid) to service_role;

create function public.ar_financial_service_actor() returns uuid language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then (array_agg(id))[1] else null end from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)
$$;
revoke all on function public.ar_financial_service_actor() from public,anon,authenticated;
grant execute on function public.ar_financial_service_actor() to service_role;
