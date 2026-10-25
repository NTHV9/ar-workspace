-- Narrow actual-Sent-only row admission. No full financial publisher, Aging
-- Master refresh, provider call or existing Sheet date update is introduced.
create table ar_private.tracker_append_policy(region text primary key check(region in('phuket','khao-lak')),enabled boolean not null default false,admitted_at timestamptz,scan_offset integer not null default 0 check(scan_offset>=0),updated_at timestamptz not null default now());
insert into ar_private.tracker_append_policy(region) values('phuket'),('khao-lak');
create table ar_private.tracker_append_restore_commands(command_id uuid primary key,owner uuid not null,region text not null,ids uuid[] not null,request_hash text not null,plan jsonb not null,created_at timestamptz not null default now());
create table ar_private.tracker_append_restore_approvals(queue_id uuid primary key references ar_private.tracker_outbox(id),command_id uuid not null references ar_private.tracker_append_restore_commands(command_id));
create table ar_private.tracker_sent_row_jobs(
 id uuid primary key,command uuid not null unique,owner uuid not null,region text not null,hotel text not null,account_id text not null,invoice_id text not null,
 source_sent_ids uuid[] not null,source_queue_ids uuid[] not null,source_hash text not null check(source_hash~'^[0-9a-f]{64}$'),
 expected_legacy_key text not null,metadata_id integer not null check(metadata_id>0),plan jsonb not null,plan_hash text not null check(plan_hash~'^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in('pending','writing','uncertain','written','conflict','hold')),attempts integer not null default 0 check(attempts>=0),
 attempt_lock uuid,ever_uncertain boolean not null default false,reason text,receipt jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner,hotel,account_id,invoice_id),unique(region,metadata_id),unique(region,expected_legacy_key)
);
alter table ar_private.tracker_append_policy enable row level security;
alter table ar_private.tracker_append_restore_commands enable row level security;
alter table ar_private.tracker_append_restore_approvals enable row level security;
alter table ar_private.tracker_sent_row_jobs enable row level security;
revoke all on ar_private.tracker_append_policy,ar_private.tracker_append_restore_commands,ar_private.tracker_append_restore_approvals,ar_private.tracker_sent_row_jobs from public,anon,authenticated,service_role;
create function ar_private.tracker_append_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['state','attempts','attempt_lock','ever_uncertain','reason','receipt','updated_at']) is distinct from (to_jsonb(old)-array['state','attempts','attempt_lock','ever_uncertain','reason','receipt','updated_at']) then raise exception 'tracker_append_immutable';end if;
 return new;
end $$;

create function public.ar_tracker_append_prepare(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_plan jsonb,p_hash text,p_rows jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;candidate jsonb;s jsonb;dates jsonb;b ar_private.tracker_bindings;j ar_private.tracker_sent_row_jobs;agent text;property text;legacy_key text;expected jsonb;frozen jsonb;formula text;n integer;begin
 o:=ar_private.tracker_append_guard(p_actor,p_region,p_lock);
 if p_id is null or p_hash is null or p_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_plan) is distinct from 'object'
  or jsonb_typeof(p_plan->'values') is distinct from 'array' or jsonb_array_length(p_plan->'values')<>33
  or exists(select 1 from jsonb_object_keys(p_plan)k where k not in('rowKey','agent','metadataId','providerVersion','values'))
  or jsonb_typeof(p_plan->'rowKey') is distinct from 'string' or jsonb_typeof(p_plan->'agent') is distinct from 'string'
  or jsonb_typeof(p_plan->'providerVersion') is distinct from 'string' or length(p_plan->>'providerVersion') not between 1 and 1000
  or jsonb_typeof(p_plan->'metadataId') is distinct from 'number' then raise exception 'tracker_append_invalid';end if;
 select * into j from ar_private.tracker_sent_row_jobs where id=p_id and owner=o and region=p_region for update;
 if found then
  if j.source_hash<>p_hash or j.plan-array['sourceRow','desiredDates','fileId','bindingRevision']<>p_plan then raise exception 'tracker_append_plan_conflict';end if;
  return ar_private.tracker_append_job(j);
 end if;
 if not exists(select 1 from ar_private.tracker_append_policy where region=p_region and enabled) then raise exception 'tracker_append_disabled';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100000 or octet_length(p_rows::text)>16777216 then raise exception 'tracker_append_invalid';end if;
 -- Freeze under the same source lock order as publication, without waiting
 -- across an in-progress traversal. begin checks this exact proof again.
 begin
  perform 1 from public.ar_accounts a where exists(select 1 from ar_private.tracker_append_admissions ad where ad.id=p_id and ad.owner=o and (ad.hotel,ad.account_id)=(a.hotel,a.id)) for share of a nowait;
  perform 1 from public.ar_invoices i where exists(select 1 from ar_private.tracker_append_admissions ad where ad.id=p_id and ad.owner=o and (ad.hotel,ad.account_id,ad.invoice_id)=(i.hotel,i.account_id,i.id)) for share of i nowait;
 exception when lock_not_available then raise exception 'tracker_append_source_busy';end;
 candidate:=ar_private.tracker_append_source(o,p_region,p_id);
 if candidate is null or candidate->>'sourceHash'<>p_hash then raise exception 'tracker_append_source_changed';end if;
 s:=candidate->'sourceRow';dates:=candidate->'desiredDates';
 select * into j from ar_private.tracker_sent_row_jobs where owner=o and hotel=candidate->>'hotel' and account_id=candidate->>'accountId' and invoice_id=candidate->>'invoiceId' for update;
 if found then return ar_private.tracker_append_job(j);end if;
 if exists(select 1 from ar_private.tracker_rows r where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(candidate->>'hotel',candidate->>'accountId',candidate->>'invoiceId'))
  or exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(candidate->>'hotel',candidate->>'accountId',candidate->>'invoiceId'))
  or exists(select 1 from ar_private.tracker_history h where (h.hotel,h.account_id,h.invoice_id)=(candidate->>'hotel',candidate->>'accountId',candidate->>'invoiceId')) then raise exception 'tracker_append_sheet_history';end if;
 if exists(select 1 from jsonb_array_elements(p_rows)r where r->>'hotel'=candidate->>'hotel' and r->>'invoiceNo'=s->>'invoiceNo'
  and (r->>'accountNo'=s->>'accountNo' or nullif(btrim(r->>'accountNo'),'') is null)) then raise exception 'tracker_append_existing_row';end if;
 select count(distinct jsonb_build_array(r->>'property',btrim(regexp_replace(r->>'agent','\s+',' ','g')))),min(r->>'property'),min(btrim(regexp_replace(r->>'agent','\s+',' ','g'))) into n,property,agent
 from jsonb_array_elements(p_rows)r where r->>'hotel'=candidate->>'hotel' and r->>'accountNo'=s->>'accountNo';
 if n<>1 or nullif(btrim(agent),'') is null or agent<>btrim(agent) or length(agent)>1000 or agent~'[[:cntrl:]]'
  or property is distinct from (case candidate->>'hotel' when 'KAT' then 'KT' when 'TSK' then 'TS' when 'TLKL' then 'TLKL' when 'WAKL' then 'WAT' when 'TLFO' then 'LFO' when 'TSAN' then 'SAN' end) then raise exception 'tracker_append_alias_unverified';end if;
 if exists(select 1 from jsonb_array_elements(p_rows)r where r->>'hotel'=candidate->>'hotel' and r->>'accountNo'=s->>'accountNo'
  and left(coalesce(r->>'rowKey',''),length(property||'|'||agent||'|'))<>property||'|'||agent||'|') then raise exception 'tracker_append_alias_unverified';end if;
 -- Match the unchanged Sheet parser's integer identity in its legacy key, while
 -- retaining the original leading-zero string in the financial E cell.
 legacy_key:=property||'|'||agent||'|I:'||(case when s->>'invoiceNo'~'^[0-9]+$' then coalesce(nullif(ltrim(s->>'invoiceNo','0'),''),'0') else btrim(regexp_replace(s->>'invoiceNo','\s+',' ','g')) end)||'|1';
 if p_plan->>'rowKey'<>legacy_key or p_plan->>'agent'<>agent or (p_plan->>'metadataId')::numeric<>ar_private.tracker_append_metadata(legacy_key)
  or exists(select 1 from jsonb_array_elements(p_rows)r where r->>'rowKey'=legacy_key) then raise exception 'tracker_append_plan_conflict';end if;
 formula:='=IF(AND(ISNUMBER(INDEX('||case when (s->>'billingRequired')::boolean then 'R:R' else 'G:G' end||',ROW())),ISNUMBER(INDEX(S:S,ROW()))),INDEX('||case when (s->>'billingRequired')::boolean then 'R:R' else 'G:G' end||',ROW())+INDEX(S:S,ROW()),"")';
 expected:=jsonb_build_array(property,agent,s->'accountNo',s->'guest',s->'invoiceNo',s->'folio',s->'transactionDate',(s->>'open')::numeric)
  ||(select jsonb_agg((x.v#>>'{}')::numeric order by x.n) from jsonb_array_elements(s->'aging') with ordinality x(v,n))
  ||jsonb_build_array((s->>'age')::integer,s->'agingLabel',s->'agingStatus',dates->'R',(s->>'creditTerm')::integer,jsonb_build_object('formula',formula),dates->'U',dates->'V',dates->'W',null,null,null,null,null,null,s->'businessDate',s->'businessDate','ใหม่วันนี้',legacy_key);
 if expected is distinct from p_plan->'values' then raise exception 'tracker_append_plan_conflict';end if;
 select * into b from ar_private.tracker_bindings where region=p_region;
 frozen:=p_plan||jsonb_build_object('sourceRow',s,'desiredDates',dates,'fileId',b.file_id,'bindingRevision',b.revision);
 insert into ar_private.tracker_sent_row_jobs(id,command,owner,region,hotel,account_id,invoice_id,source_sent_ids,source_queue_ids,source_hash,expected_legacy_key,metadata_id,plan,plan_hash)
 values(p_id,p_id,o,p_region,candidate->>'hotel',candidate->>'accountId',candidate->>'invoiceId',
  array(select jsonb_array_elements_text(candidate->'sourceSentDeliveryIds')::uuid),array(select jsonb_array_elements_text(candidate->'queueIds')::uuid),p_hash,legacy_key,ar_private.tracker_append_metadata(legacy_key),frozen,encode(sha256(convert_to(frozen::text,'UTF8')),'hex')) returning * into j;
 return ar_private.tracker_append_job(j);
end $$;

create function public.ar_tracker_append_begin(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;j ar_private.tracker_sent_row_jobs;s jsonb;b ar_private.tracker_bindings;begin
 o:=ar_private.tracker_append_guard(p_actor,p_region,p_lock);
 select * into j from ar_private.tracker_sent_row_jobs where id=p_id and owner=o and region=p_region for update;
 if j.id is null or p_hash is distinct from j.plan_hash then raise exception 'tracker_append_plan_conflict';end if;
 if j.state<>'pending' or j.ever_uncertain then return ar_private.tracker_append_job(j)||jsonb_build_object('readbackOnly',j.state in('writing','uncertain') or j.ever_uncertain);end if;
 select * into b from ar_private.tracker_bindings where region=p_region;
 s:=ar_private.tracker_append_source(o,p_region,p_id);
 if not exists(select 1 from ar_private.tracker_append_policy where region=p_region and enabled)
  or s is null or s->>'sourceHash'<>j.source_hash or b.file_id is distinct from j.plan->>'fileId' or b.revision is distinct from (j.plan->>'bindingRevision')::integer
  or exists(select 1 from ar_private.tracker_rows r where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(j.hotel,j.account_id,j.invoice_id))
  or exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(j.hotel,j.account_id,j.invoice_id))
  or exists(select 1 from ar_private.tracker_history h where (h.hotel,h.account_id,h.invoice_id)=(j.hotel,j.account_id,j.invoice_id)) then
  update ar_private.tracker_sent_row_jobs set state='hold',reason='source_or_sheet_changed',updated_at=clock_timestamp() where id=j.id returning * into j;
 else
  update ar_private.tracker_sent_row_jobs set state='writing',attempts=attempts+1,attempt_lock=p_lock,updated_at=clock_timestamp() where id=j.id returning * into j;
 end if;
 return ar_private.tracker_append_job(j)||jsonb_build_object('readbackOnly',false,'sourceAt',s->'sourceRow'->'sourceAt','currentSourceAt',s->'sourceRow'->'sourceAt');
end $$;

create function public.ar_tracker_append_finish(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_state text,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;j ar_private.tracker_sent_row_jobs;begin
 o:=ar_private.tracker_append_guard(p_actor,p_region,p_lock);
 select * into j from ar_private.tracker_sent_row_jobs where id=p_id and owner=o and region=p_region for update;
 if j.id is null then raise exception 'tracker_forbidden';end if;
 if p_state is null or p_state not in('pending','uncertain','written','conflict','hold') or jsonb_typeof(p_receipt) is distinct from 'object'
  or p_receipt->>'planHash' is distinct from j.plan_hash or p_receipt->>'rowKey' is distinct from j.expected_legacy_key
  or p_receipt->'metadataId' is distinct from to_jsonb(j.metadata_id) or jsonb_typeof(p_receipt->'mutationStarted') is distinct from 'boolean'
  or jsonb_typeof(p_receipt->'providerVersion') is distinct from 'string' or nullif(p_receipt->>'providerVersion','') is null then raise exception 'tracker_append_receipt_invalid';end if;
 if j.state='written' then return ar_private.tracker_append_job(j);end if;
 if j.state not in('writing','uncertain') then raise exception 'tracker_append_transition_invalid';end if;
 if p_state='pending' and (j.state<>'writing' or j.attempt_lock is distinct from p_lock or j.ever_uncertain
  or not(p_receipt->>'mutationStarted'='false' or coalesce(p_receipt->'rejectedStatus'='429'::jsonb,false)
   or p_region='phuket' and coalesce(p_receipt->'rejectedStatus'='412'::jsonb,false))) then raise exception 'tracker_append_retry_unsafe';end if;
 if p_state='written' and p_receipt->>'matches' is distinct from 'true' then raise exception 'tracker_append_receipt_invalid';end if;
 update ar_private.tracker_sent_row_jobs set state=p_state,ever_uncertain=ever_uncertain or p_state='uncertain' and (p_receipt->>'mutationStarted')::boolean,
  receipt=p_receipt,reason=case when p_state in('conflict','hold') then 'provider_row_requires_review' end,updated_at=clock_timestamp() where id=j.id returning * into j;
 if p_state='written' then
  -- This acknowledges the new-row append only. No existing Sheet date, current
  -- authority, workflow or mail record is rewritten by acknowledgement.
  update ar_private.tracker_outbox set state='suppressed',updated_at=clock_timestamp() where id=any(j.source_queue_ids) and owner=o and (hotel,account_id,invoice_id)=(j.hotel,j.account_id,j.invoice_id) and attempts=0;
 end if;
 return ar_private.tracker_append_job(j);
end $$;
create trigger tracker_append_immutable before update or delete on ar_private.tracker_sent_row_jobs for each row execute function ar_private.tracker_append_immutable();
create trigger tracker_append_restore_immutable before update or delete on ar_private.tracker_append_restore_commands for each row execute function ar_private.tracker_retirement_immutable();

create function ar_private.tracker_append_job(j ar_private.tracker_sent_row_jobs) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(j)||jsonb_build_object('accountId',j.account_id,'invoiceId',j.invoice_id,'sourceHash',j.source_hash,'planHash',j.plan_hash,'metadataId',j.metadata_id,
  'sourceRow',j.plan->'sourceRow','desiredDates',j.plan->'desiredDates','rowKey',j.expected_legacy_key,'invoiceNo',j.plan->'sourceRow'->'invoiceNo','folio',j.plan->'sourceRow'->'folio','date',j.plan->'sourceRow'->'transactionDate','sourceSentDeliveryIds',to_jsonb(j.source_sent_ids),'queueIds',to_jsonb(j.source_queue_ids),
  'readbackOnly',j.state in('writing','uncertain') or j.ever_uncertain);
$$;

create function ar_private.tracker_append_guard(p_actor uuid,p_region text,p_lock uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid;begin
 o:=ar_private.tracker_authorize(p_actor,p_region);
 perform 1 from ar_private.tracker_bindings where region=p_region and owner=o and enabled and bootstrap_confirmed and lock_id=p_lock and lock_until>clock_timestamp() for update;
 if not found then raise exception 'tracker_lock_lost';end if;
 return o;
end $$;
create function public.ar_tracker_append_policy_set(p_actor uuid,p_region text,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_actor,p_region);
 if p_enabled is null then raise exception 'tracker_append_invalid';end if;
 update ar_private.tracker_append_policy set enabled=p_enabled,admitted_at=case when p_enabled then coalesce(admitted_at,clock_timestamp()) else admitted_at end,updated_at=clock_timestamp() where region=p_region returning to_jsonb(tracker_append_policy) into result;
 return result;
end $$;
create function ar_private.tracker_append_metadata(p_key text) returns integer language plpgsql immutable set search_path='' as $$
declare v bigint:=2166136261;b bytea:=convert_to(p_key,'UTF8');n integer;begin
 for n in 0..length(b)-1 loop v:=((v # get_byte(b,n)::bigint)*16777619)%4294967296;end loop;
 return greatest((v & 2147483647)::integer,1);
end $$;

-- Existing suppressed work remains terminal unless exact owner approval exists.
-- Unmapped Friendly/Final/custom events have no classic queue; only events at
-- or after first enable's immutable admission cutoff are admitted directly.
create view ar_private.tracker_append_admissions with(security_invoker=true) as
 select q.id,q.owner,q.hotel,q.account_id,q.invoice_id,q.delivery_id,q.state as queue_state,q.id as queue_id
 from ar_private.tracker_outbox q join public.ar_sent_events e on e.delivery_id=q.delivery_id and e.owner=q.owner and e.hotel=q.hotel and e.account_id=q.account_id and q.invoice_id=any(e.invoice_ids)
 join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft')
 where q.attempts=0 and q.state in('pending','suppressed') and e.sent_at<=clock_timestamp()
 and (q.field='R' and e.purpose='billing' or q.field=case e.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end and e.purpose='collection')
 union all
 select md5(e.delivery_id::text||'|'||e.hotel||'|'||e.account_id||'|'||i.invoice_id)::uuid,e.owner,e.hotel,e.account_id,i.invoice_id,e.delivery_id,null::text,null::uuid
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft')
 cross join lateral unnest(e.invoice_ids)i(invoice_id)
 where e.purpose='collection' and e.stage not in('Follow 1','Follow 2','Follow 3') and e.sent_at<=clock_timestamp()
 and exists(select 1 from ar_private.tracker_append_policy p where p.enabled and e.sent_at>=p.admitted_at and e.hotel=any(ar_private.access_hotels(array[p.region])));
revoke all on ar_private.tracker_append_admissions from public,anon,authenticated,service_role;

create function ar_private.tracker_append_source(p_owner uuid,p_region text,p_id uuid,p_review boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admission record;i public.ar_invoices;a public.ar_accounts;w public.ar_invoice_workflow;aging jsonb;membership jsonb;bucket jsonb;bucket_index integer;dates jsonb;sent_ids uuid[];queue_ids uuid[];payload jsonb;source_row jsonb;proof jsonb;
begin
 select ad.* into admission from ar_private.tracker_append_admissions ad where ad.id=p_id and ad.owner=p_owner and ad.hotel=any(ar_private.access_hotels(array[p_region]))
 and (ad.queue_state is distinct from 'suppressed' or p_review or exists(select 1 from ar_private.tracker_append_restore_approvals ap where ap.queue_id=ad.queue_id));
 if admission.id is null then return null;end if;
 select * into i from public.ar_invoices where (hotel,account_id,id)=(admission.hotel,admission.account_id,admission.invoice_id);
 select * into a from public.ar_accounts where (hotel,id)=(admission.hotel,admission.account_id);
 select * into w from public.ar_invoice_workflow where (hotel,account_id,invoice_id)=(admission.hotel,admission.account_id,admission.invoice_id);
 if i.id is null or i.verification_state<>'verified' or i.open<=0 or i.collection_role not in('standalone','parent') or i.parent_invoice_id is not null
  or a.verification_state<>'verified' or a.currency<>'THB' or a.synced_at is null or a.synced_at>statement_timestamp() or i.synced_at is distinct from a.synced_at
  or a.business_date is null or not isfinite(a.business_date) or not isfinite(i.transaction_date) or a.business_date<i.transaction_date
  or nullif(btrim(i.invoice_no),'') is null or w.billing_required is null then return null;end if;
 -- Reuse the existing, account-scoped native AR qualification, including its
 -- compressed-child, current-publication and signed account-credit checks.
 aging:=public.ar_aging_invoice_status(p_actor=>p_owner,p_hotel=>i.hotel,p_accounts=>jsonb_build_array(jsonb_build_array(i.hotel,i.account_id)));
 membership:=aging->'accounts'->0->'membership';
 if aging->>'complete' is distinct from 'true' or membership->>'state' is distinct from 'resolved' or not ar_private.aging_schema_valid(a."agingBuckets") or jsonb_array_length(a."agingBuckets")<>6 then return null;end if;
 -- The existing Sheet's six physical financial columns have fixed boundaries.
 if exists(select 1 from jsonb_array_elements(a."agingBuckets") with ordinality x(b,n) where
  (b->>'start')::integer<>(case when n=1 then 0 else (n-1)*30+1 end) or
  (case when n=6 then b->'end'<>'null'::jsonb else (b->>'end')::integer<>n*30 end)) then return null;end if;
 select b,n::integer-1 into bucket,bucket_index from jsonb_array_elements(a."agingBuckets") with ordinality x(b,n)
 where greatest(i.age+(membership->>'offsetDays')::integer,0)>=(b->>'start')::integer and (b->'end'='null'::jsonb or greatest(i.age+(membership->>'offsetDays')::integer,0)<=(b->>'end')::integer);
 if bucket is null then return null;end if;
 select jsonb_build_object('R',min((e.sent_at at time zone 'Asia/Bangkok')::date) filter(where e.purpose='billing'),
  'U',max((e.sent_at at time zone 'Asia/Bangkok')::date) filter(where e.purpose='collection' and e.stage='Follow 1'),
  'V',max((e.sent_at at time zone 'Asia/Bangkok')::date) filter(where e.purpose='collection' and e.stage='Follow 2'),
  'W',max((e.sent_at at time zone 'Asia/Bangkok')::date) filter(where e.purpose='collection' and e.stage='Follow 3')),
  array_agg(e.delivery_id order by e.delivery_id) into dates,sent_ids
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in('send','draft')
 where e.owner=p_owner and e.hotel=i.hotel and e.account_id=i.account_id and i.id=any(e.invoice_ids) and e.sent_at<=clock_timestamp();
 select coalesce(array_agg(ad.queue_id order by ad.queue_id),'{}'::uuid[]) into queue_ids from ar_private.tracker_append_admissions ad
 where ad.owner=p_owner and (ad.hotel,ad.account_id,ad.invoice_id)=(i.hotel,i.account_id,i.id) and ad.queue_id is not null
 and (ad.queue_state='pending' or p_review and ad.queue_id=p_id or exists(select 1 from ar_private.tracker_append_restore_approvals ap where ap.queue_id=ad.queue_id));
 source_row:=jsonb_build_object('hotel',i.hotel,'accountId',i.account_id,'invoiceId',i.id,'accountNo',coalesce(a.account_no,a.id),'accountName',a.name,'accountType',a.type,
  'guest',i.guest,'invoiceNo',i.invoice_no,'folio',i.folio_no,'transactionDate',i.transaction_date,'open',ar_private.financial_money(i.open),
  'aging',(select jsonb_agg(ar_private.financial_money(case when n-1=bucket_index then i.open else 0 end) order by n) from generate_series(1,6)n),
  'age',a.business_date-i.transaction_date,'agingLabel',(array['0-30','31-60','61-90','91-120','121-150','151+'])[bucket_index+1],
  'agingStatus',case when bucket_index>=3 then '🔴 เกิน 90 วัน' when bucket_index=2 then '🟡 ใกล้ 90 วัน' else '🟢 ปกติ' end,
  'businessDate',a.business_date,'sourceAt',i.synced_at,'creditTerm',w.credit_term,'billingRequired',w.billing_required);
 -- A repeat successful refresh with identical business facts is not a new
 -- intent. Qualification still requires the CURRENT invoice/account pair to
 -- have identical publication timestamps; timestamps themselves are observed
 -- freshness, not part of the immutable business-payload fence.
 proof:=jsonb_build_object('invoice',to_jsonb(i)-'synced_at','account',to_jsonb(a)-'synced_at','membership',membership,'billingRequired',w.billing_required,'creditTerm',w.credit_term,
  'desiredDates',dates,'sourceSentDeliveryIds',to_jsonb(sent_ids),'queueIds',to_jsonb(queue_ids),'admission',to_jsonb(admission));
 payload:=jsonb_build_object('id',p_id,'command',p_id,'hotel',i.hotel,'accountId',i.account_id,'invoiceId',i.id,'invoiceNo',i.invoice_no,'folio',i.folio_no,'date',i.transaction_date,
  'sourceRow',source_row,'desiredDates',dates,'sourceSentDeliveryIds',to_jsonb(sent_ids),'queueIds',to_jsonb(queue_ids),'state','pending');
 return payload||jsonb_build_object('sourceHash',encode(sha256(convert_to(proof::text,'UTF8')),'hex'));
end $$;

create function public.ar_tracker_append_candidates(p_actor uuid,p_region text,p_lock uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;result jsonb;scan integer;begin
 o:=ar_private.tracker_append_guard(p_actor,p_region,p_lock);
 if p_offset is null or p_offset not between -1 and 1000000 then raise exception 'tracker_append_invalid';end if;
 if not exists(select 1 from ar_private.tracker_append_policy where region=p_region and enabled) then return jsonb_build_object('jobs','[]'::jsonb,'total',0,'enabled',false,'offsetUsed',0,'nextOffset',0);end if;
 scan:=p_offset;
 if p_offset=-1 then select scan_offset into scan from ar_private.tracker_append_policy where region=p_region for update;end if;
 with admitted as materialized(select distinct on(ad.hotel,ad.account_id,ad.invoice_id) ad.* from ar_private.tracker_append_admissions ad
  where ad.owner=o and ad.hotel=any(ar_private.access_hotels(array[p_region])) and (ad.queue_state is distinct from 'suppressed' or exists(select 1 from ar_private.tracker_append_restore_approvals ap where ap.queue_id=ad.queue_id))
  and not exists(select 1 from ar_private.tracker_sent_row_jobs j where j.owner=o and (j.hotel,j.account_id,j.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_rows r where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_history h where (h.hotel,h.account_id,h.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  order by ad.hotel,ad.account_id,ad.invoice_id,ad.id),
 new_jobs as materialized(select ar_private.tracker_append_source(o,p_region,a.id) as value from admitted a),
 all_jobs as(select value,0 as priority,'-infinity'::timestamptz as scan_at from new_jobs where value is not null union all
  select ar_private.tracker_append_job(j),case when j.state='pending' then 0 when j.state in('writing','uncertain') then 1 else 2 end,j.updated_at
  from ar_private.tracker_sent_row_jobs j where j.owner=o and j.region=p_region and j.state in('pending','writing','uncertain','hold','conflict')),
 stats as(select count(*) as total from all_jobs),
 position as(select total,case when p_offset=-1 and scan>=total then 0 else scan end as used from stats)
 select jsonb_build_object('enabled',true,'total',position.total,'offsetUsed',position.used,'nextOffset',case when position.used+100>=position.total then 0 else position.used+100 end,
  'jobs',coalesce((select jsonb_agg(value order by priority,scan_at,value->>'hotel',value->>'accountId',value->>'invoiceId') from(select * from all_jobs order by priority,scan_at,value->>'hotel',value->>'accountId',value->>'invoiceId' offset position.used limit 100)p),'[]'::jsonb)) into result from position;
 if p_offset=-1 then update ar_private.tracker_append_policy set scan_offset=(result->>'nextOffset')::integer where region=p_region;end if;
 return result;
end $$;

create function ar_private.tracker_append_restore_plan(p_actor uuid,p_region text,p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q ar_private.tracker_outbox;b ar_private.tracker_bindings;items jsonb:='[]';s jsonb;begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_actor,p_region);
 if p_ids is null or cardinality(p_ids) not between 1 and 100 or exists(select 1 from unnest(p_ids)v group by v having v is null or count(*)<>1) then raise exception 'tracker_append_invalid';end if;
 select * into b from ar_private.tracker_bindings where region=p_region and owner=p_actor;
 if b.region is null or not b.enabled or not b.bootstrap_confirmed or b.lock_until>clock_timestamp() then raise exception 'tracker_append_review_busy';end if;
 for q in select * from ar_private.tracker_outbox where id=any(p_ids) order by id loop
  if q.owner is distinct from p_actor or not q.hotel=any(ar_private.access_hotels(array[p_region])) or q.state<>'suppressed' or q.attempts<>0 or q.field<>'R'
   or exists(select 1 from ar_private.tracker_append_restore_approvals ap where ap.queue_id=q.id)
   or not exists(select 1 from ar_private.tracker_retirement_commands cmd cross join lateral jsonb_array_elements(cmd.plan->'items')x
    where cmd.actor=p_actor and cmd.region=p_region and x->>'id'=q.id::text and x->>'disposition'='quarantine_missing_row')
   or exists(select 1 from ar_private.tracker_rows r where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(q.hotel,q.account_id,q.invoice_id))
   or exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(q.hotel,q.account_id,q.invoice_id))
   or exists(select 1 from ar_private.tracker_history h where (h.hotel,h.account_id,h.invoice_id)=(q.hotel,q.account_id,q.invoice_id)) then raise exception 'tracker_append_restore_ineligible';end if;
  s:=ar_private.tracker_append_source(p_actor,p_region,q.id,true);
  if s is null then raise exception 'tracker_append_restore_ineligible';end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',q.id,'queue',to_jsonb(q),'source',s));
 end loop;
 if jsonb_array_length(items)<>cardinality(p_ids) then raise exception 'tracker_append_restore_ineligible';end if;
 s:=jsonb_build_object('binding',jsonb_build_object('owner',b.owner,'region',b.region,'fileId',b.file_id,'revision',b.revision,'version',b.version),'items',items);
 return s||jsonb_build_object('hash',encode(sha256(convert_to(s::text,'UTF8')),'hex'));
end $$;
create function public.ar_tracker_append_restore_preview(p_actor uuid,p_region text,p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$ select ar_private.tracker_append_restore_plan(p_actor,p_region,p_ids); $$;
create function public.ar_tracker_append_restore_apply(p_actor uuid,p_region text,p_command uuid,p_ids uuid[],p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];old ar_private.tracker_append_restore_commands;plan jsonb;begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_actor,p_region);
 if p_command is null or p_hash is null or p_hash!~'^[0-9a-f]{64}$' then raise exception 'tracker_append_invalid';end if;
 select array_agg(v order by v) into ids from unnest(p_ids)v;
 perform pg_advisory_xact_lock(hashtextextended(p_command::text,241025));
 select * into old from ar_private.tracker_append_restore_commands where command_id=p_command;
 if found then
  if old.owner is distinct from p_actor or old.region is distinct from p_region or old.ids is distinct from ids or old.request_hash is distinct from p_hash then raise exception 'tracker_append_command_conflict';end if;
  return jsonb_build_object('commandId',p_command,'approved',cardinality(ids),'hash',p_hash);
 end if;
 perform 1 from ar_private.tracker_bindings where region=p_region for update;
 perform 1 from ar_private.tracker_outbox where id=any(p_ids) order by id for update;
 plan:=ar_private.tracker_append_restore_plan(p_actor,p_region,p_ids);
 if plan->>'hash' is distinct from p_hash then raise exception 'tracker_append_preview_stale';end if;
 insert into ar_private.tracker_append_restore_commands(command_id,owner,region,ids,request_hash,plan) values(p_command,p_actor,p_region,ids,p_hash,plan);
 insert into ar_private.tracker_append_restore_approvals(queue_id,command_id) select v,p_command from unnest(ids)v;
 return jsonb_build_object('commandId',p_command,'approved',cardinality(ids),'hash',p_hash);
end $$;

-- A frozen append owns its covered classic intents immediately. New later Sent
-- intents can use normal date publication after the appended row is observed;
-- writing/unknown append outcomes block all sibling writes until reconciled.
do $patch$
declare definition text;needle text:='where q.owner=o and';begin
 definition:=pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_append_outbox_drift';end if;
 execute replace(definition,needle,needle||' not exists(select 1 from ar_private.tracker_sent_row_jobs aj where aj.owner=o and aj.region=p_region and (q.id=any(aj.source_queue_ids) or (aj.hotel,aj.account_id,aj.invoice_id)=(q.hotel,q.account_id,q.invoice_id) and aj.state in(''pending'',''writing'',''uncertain''))) and');
end $patch$;

create function ar_private.tracker_append_status(p_owner uuid,p_region text) returns jsonb language sql stable security definer set search_path='' as $$
 with admitted as materialized(select distinct on(ad.hotel,ad.account_id,ad.invoice_id) ad.* from ar_private.tracker_append_admissions ad
  where ad.owner=p_owner and ad.hotel=any(ar_private.access_hotels(array[p_region]))
  and exists(select 1 from ar_private.tracker_append_policy p where p.region=p_region and p.enabled)
  and (ad.queue_state is distinct from 'suppressed' or exists(select 1 from ar_private.tracker_append_restore_approvals ap where ap.queue_id=ad.queue_id))
  and not exists(select 1 from ar_private.tracker_sent_row_jobs j where j.owner=p_owner and (j.hotel,j.account_id,j.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_rows r where r.region=p_region and (r.hotel,r.account_id,r.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  and not exists(select 1 from ar_private.tracker_history h where (h.hotel,h.account_id,h.invoice_id)=(ad.hotel,ad.account_id,ad.invoice_id))
  order by ad.hotel,ad.account_id,ad.invoice_id,ad.id),
 pending_source as materialized(select ar_private.tracker_append_source(p_owner,p_region,a.id) as value from admitted a),
 rows as(select j.hotel,j.plan->'sourceRow'->>'invoiceNo' as invoice_no,j.plan->'desiredDates'->>'R' as billing_date,j.state,j.reason
  from ar_private.tracker_sent_row_jobs j where j.owner=p_owner and j.region=p_region and j.state<>'written'
  union all select value->>'hotel',value->>'invoiceNo',value->'desiredDates'->>'R','pending',null from pending_source where value is not null)
 select jsonb_build_object('pendingRowAdds',(select count(*) from rows where state='pending'),
  'uncertainRowAdds',(select count(*) from rows where state in('writing','uncertain')),
  'heldRowAdds',(select count(*) from rows where state in('hold','conflict')),
  'rowAddLastSuccessAt',(select max(j.updated_at) from ar_private.tracker_sent_row_jobs j where j.owner=p_owner and j.region=p_region and j.state='written'),
  'rowAddRows',coalesce((select jsonb_agg(jsonb_build_object('hotel',r.hotel,'invoiceNo',r.invoice_no,'billingDate',r.billing_date,'state',r.state,'reason',r.reason) order by r.hotel,r.invoice_no,r.state) from(select * from rows order by hotel,invoice_no,state limit 20)r),'[]'::jsonb));
$$;
do $status$
declare definition text;needle text:='return ar_private.tracker_retirement_status(o,p_region)||';begin
 definition:=pg_get_functiondef('public.ar_tracker_status(uuid,text)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_append_status_drift';end if;
 execute replace(definition,needle,'return ar_private.tracker_append_status(o,p_region)||ar_private.tracker_retirement_status(o,p_region)||');
end $status$;

revoke all on function ar_private.tracker_append_immutable(),ar_private.tracker_append_job(ar_private.tracker_sent_row_jobs),ar_private.tracker_append_guard(uuid,text,uuid),ar_private.tracker_append_metadata(text),ar_private.tracker_append_source(uuid,text,uuid,boolean),ar_private.tracker_append_restore_plan(uuid,text,uuid[]),ar_private.tracker_append_status(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_tracker_append_policy_set(uuid,text,boolean),public.ar_tracker_append_candidates(uuid,text,uuid,integer),public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb),public.ar_tracker_append_begin(uuid,text,uuid,uuid,text),public.ar_tracker_append_finish(uuid,text,uuid,uuid,text,jsonb),public.ar_tracker_append_restore_preview(uuid,text,uuid[]),public.ar_tracker_append_restore_apply(uuid,text,uuid,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function public.ar_tracker_append_policy_set(uuid,text,boolean),public.ar_tracker_append_candidates(uuid,text,uuid,integer),public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb),public.ar_tracker_append_begin(uuid,text,uuid,uuid,text),public.ar_tracker_append_finish(uuid,text,uuid,uuid,text,jsonb),public.ar_tracker_append_restore_preview(uuid,text,uuid[]),public.ar_tracker_append_restore_apply(uuid,text,uuid,uuid[],text) to service_role;
