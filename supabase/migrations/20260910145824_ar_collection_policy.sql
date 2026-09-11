-- DRAFT: apply after ar_invoice_exceptions. Global versioned policy; no sends or ledger writes.
create function ar_private.collection_policy_valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb;keys text[]:='{}';labels text[]:='{}';n integer:=0;terminals integer:=0;prior_due integer:=-366;seen_previous boolean:=false;last_terminal boolean:=false;k text;label text;anchor text;days integer;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) not between 1 and 100 or octet_length(v::text)>65536 then return false;end if;
 for r in select value from jsonb_array_elements(v) loop
  if jsonb_typeof(r) is distinct from 'object' or not(r?&array['key','label','anchor','offsetDays','terminal','active']) or r-array['key','label','anchor','offsetDays','terminal','active']<>'{}'::jsonb then return false;end if;
  if jsonb_typeof(r->'key') is distinct from 'string' or jsonb_typeof(r->'label') is distinct from 'string' or jsonb_typeof(r->'anchor') is distinct from 'string' or jsonb_typeof(r->'offsetDays') is distinct from 'number' or jsonb_typeof(r->'terminal') is distinct from 'boolean' or jsonb_typeof(r->'active') is distinct from 'boolean' then return false;end if;
  k:=r->>'key';label:=r->>'label';anchor:=r->>'anchor';
  if k!~'^(Friendly|Follow 1|Follow 2|Follow 3|Final|round_[a-z0-9][a-z0-9_-]{0,63})$' or k=any(keys) or length(label) not between 1 and 80 or btrim(label)<>label or label~'[[:cntrl:]]' or label~'^[[:space:]]*$' or anchor not in('due','previous_sent') or r->>'offsetDays'!~'^-?(0|[1-9][0-9]{0,3})$' then return false;end if;
  keys:=array_append(keys,k);days:=(r->>'offsetDays')::integer;
  if days>3650 or days<(case when anchor='due' then -365 else 0 end) then return false;end if;
  if (r->>'active')::boolean then
   n:=n+1;if n=1 and anchor<>'due' or lower(label)=any(labels) then return false;end if;labels:=array_append(labels,lower(label));
   if anchor='previous_sent' then seen_previous:=true;else if seen_previous or days<=prior_due then return false;end if;prior_due:=days;end if;
   last_terminal:=(r->>'terminal')::boolean;if last_terminal then terminals:=terminals+1;end if;
  end if;
 end loop;
 return n>0 and terminals=1 and last_terminal;
exception when others then return false;
end $$;
create table ar_private.collection_policy_versions(version integer primary key check(version>0),rounds jsonb not null check(ar_private.collection_policy_valid(rounds)),actor uuid,reason text not null,recorded_at timestamptz not null default now());
create table ar_private.collection_policy_head(singleton boolean primary key default true check(singleton),version integer not null references ar_private.collection_policy_versions(version));
create table ar_private.collection_stage_keys(key text primary key,first_version integer not null references ar_private.collection_policy_versions(version));
create table ar_private.collection_policy_commands(actor uuid not null,command_id uuid not null,input jsonb not null,version integer not null references ar_private.collection_policy_versions(version),primary key(actor,command_id));
insert into ar_private.collection_policy_versions(version,rounds,reason) values(1,'[
 {"key":"Friendly","label":"Friendly","anchor":"due","offsetDays":-7,"terminal":false,"active":true},
 {"key":"Follow 1","label":"Follow-up 1","anchor":"due","offsetDays":1,"terminal":false,"active":true},
 {"key":"Follow 2","label":"Follow-up 2","anchor":"previous_sent","offsetDays":7,"terminal":false,"active":true},
 {"key":"Follow 3","label":"Follow-up 3","anchor":"previous_sent","offsetDays":7,"terminal":false,"active":true},
 {"key":"Final","label":"Final","anchor":"previous_sent","offsetDays":7,"terminal":true,"active":true}
]','Confirmed default collection rounds');
insert into ar_private.collection_policy_head values(true,1);
insert into ar_private.collection_stage_keys select value->>'key',1 from ar_private.collection_policy_versions,jsonb_array_elements(rounds) where version=1;
alter table ar_private.collection_policy_versions enable row level security;
alter table ar_private.collection_policy_head enable row level security;
alter table ar_private.collection_stage_keys enable row level security;
alter table ar_private.collection_policy_commands enable row level security;
revoke all on ar_private.collection_policy_versions,ar_private.collection_policy_head,ar_private.collection_stage_keys,ar_private.collection_policy_commands from public,anon,authenticated,service_role;
create function ar_private.collection_policy_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'collection_policy_evidence_immutable';end$$;
create trigger collection_policy_versions_immutable before update or delete on ar_private.collection_policy_versions for each row execute function ar_private.collection_policy_immutable();
create trigger collection_stage_keys_immutable before update or delete on ar_private.collection_stage_keys for each row execute function ar_private.collection_policy_immutable();
create trigger collection_policy_commands_immutable before update or delete on ar_private.collection_policy_commands for each row execute function ar_private.collection_policy_immutable();

create function public.ar_collection_policy_get(p_actor uuid,p_version integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','policy_forbidden');end if;
 select jsonb_build_object('version',v.version,'rounds',v.rounds) into r from ar_private.collection_policy_versions v where v.version=coalesce(p_version,(select version from ar_private.collection_policy_head where singleton));
 return coalesce(r,jsonb_build_object('error','policy_missing'));
end $$;
create function public.ar_collection_policy_history(p_actor uuid,p_offset integer,p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','policy_forbidden');end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','policy_invalid');end if;
 select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'rounds',v.rounds,'reason',v.reason,'recordedAt',v.recorded_at) order by v.version desc),'[]') into rows from(select * from ar_private.collection_policy_versions order by version desc limit p_limit offset p_offset)v;
 return jsonb_build_object('rows',rows,'total',(select count(*) from ar_private.collection_policy_versions));
end $$;
create function public.ar_collection_policy_command_get(p_actor uuid,p_command uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v integer;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','policy_forbidden');end if;
 if p_command is null then return jsonb_build_object('error','policy_invalid');end if;
 select version into v from ar_private.collection_policy_commands where actor=p_actor and command_id=p_command;
 return case when found then jsonb_build_object('complete',true,'version',v) else jsonb_build_object('complete',false) end;
end $$;
create function public.ar_collection_policy_save(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.collection_policy_commands;cmd uuid;expected integer;current_version integer;next_version integer;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','policy_forbidden');end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'commandId') is distinct from 'string' or p_input->>'commandId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error','policy_invalid');end if;
 cmd:=(p_input->>'commandId')::uuid;perform pg_advisory_xact_lock(94309,1);
 select * into c from ar_private.collection_policy_commands where actor=p_actor and command_id=cmd;
 if found then if c.input is distinct from p_input then return jsonb_build_object('error','policy_command_conflict');end if;return public.ar_collection_policy_get(p_actor,c.version);end if;
 if not(p_input?&array['commandId','revision','confirmed','reason','rounds']) or p_input-array['commandId','revision','confirmed','reason','rounds']<>'{}'::jsonb or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'revision') is distinct from 'number' or p_input->>'revision'!~'^[1-9][0-9]{0,9}$' or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(p_input->>'reason') not between 1 and 1000 or p_input->>'reason'~'[[:cntrl:]]' or p_input->>'reason'~'^[[:space:]]*$' or not ar_private.collection_policy_valid(p_input->'rounds') then return jsonb_build_object('error','policy_invalid');end if;
 if (p_input->>'revision')::bigint>2147483647 then return jsonb_build_object('error','policy_invalid');end if;expected:=(p_input->>'revision')::integer;
 select version into current_version from ar_private.collection_policy_head where singleton for update;
 if expected<>current_version or current_version=2147483647 then return jsonb_build_object('error','policy_revision_conflict');end if;
 if exists(select 1 from ar_private.collection_stage_keys k where not exists(select 1 from jsonb_array_elements(p_input->'rounds') r where r->>'key'=k.key)) then return jsonb_build_object('error','policy_retirement_required');end if;
 next_version:=current_version+1;
 insert into ar_private.collection_policy_versions(version,rounds,actor,reason) values(next_version,p_input->'rounds',p_actor,btrim(p_input->>'reason'));
 insert into ar_private.collection_stage_keys(key,first_version) select r->>'key',next_version from jsonb_array_elements(p_input->'rounds')r on conflict do nothing;
 update ar_private.collection_policy_head set version=next_version where singleton;
 insert into ar_private.collection_policy_commands values(p_actor,cmd,p_input,next_version);
 return public.ar_collection_policy_get(p_actor,next_version);
end $$;

create function ar_private.collection_policy_stage(p_version integer,p_key text,p_allow_retired boolean default false) returns jsonb language sql stable set search_path='' as $$
 select (r.value-'active')||jsonb_build_object('policyVersion',v.version,'position',r.ordinality-1,'earlierKeys',coalesce((select jsonb_agg(p.value->'key' order by p.ordinality) from jsonb_array_elements(v.rounds) with ordinality p(value,ordinality) where p.ordinality<r.ordinality and (p.value->>'active')::boolean),'[]'))
 from ar_private.collection_policy_versions v cross join lateral jsonb_array_elements(v.rounds) with ordinality r(value,ordinality)
 where v.version=p_version and r.value->>'key'=p_key and (p_allow_retired or (r.value->>'active')::boolean);
$$;

alter table ar_private.mail_deliveries add column collection_policy_version integer references ar_private.collection_policy_versions(version),add column stage_snapshot jsonb;
alter table public.ar_sent_events add column collection_policy_version integer references ar_private.collection_policy_versions(version),add column stage_snapshot jsonb;
alter table public.ar_invoice_workflow add column last_reminder_policy_version integer references ar_private.collection_policy_versions(version),add column last_reminder_stage_snapshot jsonb;
alter table ar_private.mail_deliveries add constraint ar_mail_stage_policy_pair check((collection_policy_version is null)=(stage_snapshot is null));
alter table public.ar_sent_events add constraint ar_sent_stage_policy_pair check((collection_policy_version is null)=(stage_snapshot is null));
alter table public.ar_invoice_workflow add constraint ar_workflow_stage_policy_pair check((last_reminder_policy_version is null)=(last_reminder_stage_snapshot is null));
alter table public.ar_invoice_workflow drop constraint ar_invoice_workflow_last_reminder_stage_check;
alter table public.ar_invoice_workflow add constraint ar_workflow_registered_stage foreign key(last_reminder_stage) references ar_private.collection_stage_keys(key);
create function ar_private.preserve_claim_stage_policy() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.collection_policy_version,new.stage_snapshot) is distinct from row(old.collection_policy_version,old.stage_snapshot) then raise exception 'collection_claim_policy_immutable';end if;return new;
end $$;
create trigger ar_preserve_claim_stage_policy before update of collection_policy_version,stage_snapshot on ar_private.mail_deliveries for each row execute function ar_private.preserve_claim_stage_policy();

create function ar_private.capture_workflow_stage_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare v integer;expected jsonb;
begin
 if new.last_reminder_stage is null then new.last_reminder_policy_version:=null;new.last_reminder_stage_snapshot:=null;return new;end if;
 if new.last_reminder_stage_snapshot is not null and new.last_reminder_stage_snapshot->>'key'=new.last_reminder_stage and new.last_reminder_policy_version is not null then
  expected:=ar_private.collection_policy_stage(new.last_reminder_policy_version,new.last_reminder_stage,true);
  if expected is null or expected is distinct from new.last_reminder_stage_snapshot then raise exception 'history_policy_invalid';end if;return new;
 end if;
 if tg_op='UPDATE' and new.last_reminder_stage is not distinct from old.last_reminder_stage and old.last_reminder_stage_snapshot is null and new.last_reminder_stage_snapshot is null then
  expected:=ar_private.collection_policy_stage(1,new.last_reminder_stage,true);
  if expected is not null then new.last_reminder_policy_version:=1;new.last_reminder_stage_snapshot:=expected;return new;end if;
 end if;
 select version into v from ar_private.collection_policy_head where singleton for share;
 expected:=ar_private.collection_policy_stage(v,new.last_reminder_stage,true);
 if expected is null then raise exception 'history_policy_invalid';end if;
 new.last_reminder_policy_version:=v;new.last_reminder_stage_snapshot:=expected;return new;
end $$;
create trigger ar_capture_workflow_stage_policy before insert or update of last_reminder_stage,last_reminder_date,last_reminder_policy_version,last_reminder_stage_snapshot on public.ar_invoice_workflow for each row execute function ar_private.capture_workflow_stage_policy();

-- Existing historical editor accepts registered archived keys, not just the initial five.
-- Root replaces its Worker/UI fixed stage picker with the shared registry-backed policy contract.
do $$
declare definition text;needle text:='p_stage not in (''Friendly'',''Follow 1'',''Follow 2'',''Follow 3'',''Final'')';
begin
 definition:=pg_get_functiondef('public.ar_workflow_history_save(uuid,text,text,text,integer,date,text,date)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'review current workflow history stage validator before applying policy';end if;
 definition:=replace(definition,needle,'not exists(select 1 from ar_private.collection_stage_keys where key=p_stage)');execute definition;
end $$;

revoke all on function ar_private.collection_policy_valid(jsonb),ar_private.collection_policy_immutable(),ar_private.collection_policy_stage(integer,text,boolean),ar_private.preserve_claim_stage_policy(),ar_private.capture_workflow_stage_policy() from public,anon,authenticated,service_role;
revoke all on function public.ar_collection_policy_get(uuid,integer),public.ar_collection_policy_history(uuid,integer,integer),public.ar_collection_policy_command_get(uuid,uuid),public.ar_collection_policy_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ar_collection_policy_get(uuid,integer),public.ar_collection_policy_history(uuid,integer,integer),public.ar_collection_policy_command_get(uuid,uuid),public.ar_collection_policy_save(uuid,jsonb) to service_role;

-- Deepest current new-app helper: all outer exception/thread guards and By System logic remain.
create or replace function ar_private.mail_claim_before_threads(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;m ar_private.mail_deliveries;w public.ar_invoice_workflow;hist jsonb:='[]';n integer:=0;chosen_policy_version integer;stage_proof jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor;
 if found then
  if p_mode='test' and (m.mode<>'test' or m.snapshot->'expected'->>'recipientHash' is distinct from p_expected->>'recipientHash' or m.snapshot->'expected'->'supplementalSource' is distinct from p_expected->'supplementalSource' or nullif(m.snapshot->'expected'->'richBody','null'::jsonb) is distinct from nullif(p_expected->'richBody','null'::jsonb)) then return jsonb_build_object('error','email_test_command_conflict');end if;
  return to_jsonb(m)||jsonb_build_object('claimed',false);
 end if;
 if p_mode is null or p_mode not in ('draft','send','test') or p_expected is null or jsonb_typeof(p_expected)<>'object' or p_message_id is null or p_message_id !~ '^<[0-9a-f-]{36}@ar-workspace[.]ar-c82[.]workers[.]dev>$' then return jsonb_build_object('error','email_invalid');end if;
 if p_mode='test' then
  if p_draft is not null or p_expected?'recipients' or not p_expected?'recipientHash' then return jsonb_build_object('error','email_invalid');end if;
  if p_expected?'supplementalSource' then
   select * into d from public.ar_email_drafts where id=(p_expected->'supplementalSource'->>'draftId')::uuid and owner=p_actor for update;
   if not found then return jsonb_build_object('error','email_missing');end if;
   if d.revision<>(p_expected->'supplementalSource'->>'revision')::integer then return jsonb_build_object('error','email_revision_conflict');end if;
   select count(*) into n from public.ar_email_attachments where draft_id=d.id and not removed and id in(select value::uuid from jsonb_array_elements_text(p_expected->'supplementalSource'->'ids'));
   if n<>jsonb_array_length(p_expected->'supplementalSource'->'ids') then return jsonb_build_object('error','email_attachment_missing');end if;
  end if;
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot) values(p_id,p_actor,p_mode,p_message_id,jsonb_build_object('expected',p_expected));
 else
  select * into d from public.ar_email_drafts where id=p_draft and owner=p_actor for update;
  if not found then return jsonb_build_object('error','email_missing');end if;
  if d.purpose='billing' and exists(select 1 from public.ar_account_settings s where s.hotel=d.hotel and s.account_id=d.account_id and s.billing_method='system') then return jsonb_build_object('error','email_system_billing_required');end if;
  select * into m from ar_private.mail_deliveries where draft_id=p_draft and revision=p_revision;
  if found then return to_jsonb(m)||jsonb_build_object('claimed',false);end if;
  if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
  if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_draft and state<>'sent') then return jsonb_build_object('error','email_handoff_pending');end if;
  select * into j from public.ar_document_jobs where id=d.document_job_id for share;
  if j.revision<>d.document_revision or not j.acknowledged or j.state<>'ready' or jsonb_array_length(d.exports)=0 then return jsonb_build_object('error','email_package_changed');end if;
  if p_expected->'recipients' is distinct from d.recipients or p_expected->>'subject' is distinct from d.subject or p_expected->>'body' is distinct from d.body or nullif(p_expected->'richBody','null'::jsonb) is distinct from d.rich_body then return jsonb_build_object('error','email_revision_conflict');end if;
  if d.purpose='collection' then
   select version into chosen_policy_version from ar_private.collection_policy_head where singleton for share;
   if chosen_policy_version is null then return jsonb_build_object('error','email_unavailable');end if;
   if p_expected?'policyVersion' then
    if jsonb_typeof(p_expected->'policyVersion') is distinct from 'number' or p_expected->>'policyVersion'!~'^[1-9][0-9]{0,9}$' or p_expected->>'policyVersion' is distinct from chosen_policy_version::text then return jsonb_build_object('error','email_policy_revision_conflict');end if;
   elsif chosen_policy_version<>1 then return jsonb_build_object('error','email_policy_revision_conflict');end if;
   stage_proof:=ar_private.collection_policy_stage(chosen_policy_version,p_stage,false);
   if stage_proof is null then return jsonb_build_object('error','email_stage_required');end if;
  end if;
  if d.purpose='billing' and p_stage is not null then return jsonb_build_object('error','email_invalid');end if;
  for w in select * from public.ar_invoice_workflow where hotel=d.hotel and account_id=d.account_id and invoice_id=any(d.invoice_ids) order by invoice_id for update loop
   if p_mode='send' and (w.billing_required is null or w.credit_term is null or (d.purpose='billing' and not w.billing_required)) then return jsonb_build_object('error','email_rules_missing');end if;
   hist:=hist||jsonb_build_array(to_jsonb(w));n:=n+1;
  end loop;
  if n<>cardinality(d.invoice_ids) then return jsonb_build_object('error','email_rules_missing');end if;
  insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,stage,message_id,collection_policy_version,stage_snapshot,snapshot)
  values(p_id,p_actor,p_draft,p_revision,p_mode,p_stage,p_message_id,chosen_policy_version,stage_proof,jsonb_build_object('expected',p_expected,'draft',public.ar_email_get(p_actor,p_draft),'manifest',j.manifest,'workflow',hist));
 end if;
 select * into m from ar_private.mail_deliveries where id=p_id;return to_jsonb(m)||jsonb_build_object('claimed',true);
end $$;


-- SENT copies the captured claim definition, never the current active policy.
create or replace function public.ar_mail_confirm_sent(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.mail_deliveries;d jsonb;prev jsonb;w public.ar_invoice_workflow;day date;total numeric;captured_version integer;captured_stage jsonb;
begin
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if m.state='sent' then return jsonb_build_object('state','sent','recorded',m.mode<>'test');end if;
 if p_gmail_id is null or p_sent_at is null or p_sent_at<m.created_at-interval '5 minutes' or p_sent_at>now()+interval '5 minutes' then return jsonb_build_object('error','email_evidence_invalid');end if;
 if m.mode='test' then update ar_private.mail_deliveries set state='sent',gmail_id=p_gmail_id,sent_at=p_sent_at,reason=null where id=p_id;return jsonb_build_object('state','sent','recorded',false);end if;
 d:=m.snapshot->'draft';day:=(p_sent_at at time zone 'Asia/Bangkok')::date;
 if d->>'purpose'='collection' then
  captured_version:=coalesce(m.collection_policy_version,1);
  captured_stage:=coalesce(m.stage_snapshot,ar_private.collection_policy_stage(captured_version,m.stage,true));
  if captured_stage is null or captured_stage is distinct from ar_private.collection_policy_stage(captured_version,m.stage,true) then
   update ar_private.mail_deliveries set state='review_required',reason='stage_policy_unverified',gmail_id=p_gmail_id,sent_at=p_sent_at where id=p_id;
   return jsonb_build_object('state','review_required','recorded',false);
  end if;
 end if;
 for prev in select value from jsonb_array_elements(m.snapshot->'workflow') order by value->>'invoice_id' loop
  select * into w from public.ar_invoice_workflow where hotel=prev->>'hotel' and account_id=prev->>'account_id' and invoice_id=prev->>'invoice_id' for update;
  if not found or w.revision<>(prev->>'revision')::integer or w.billing_required is null or w.credit_term is null or (d->>'purpose'='billing' and not w.billing_required) then
   update ar_private.mail_deliveries set state='review_required',reason='workflow_changed',gmail_id=p_gmail_id,sent_at=p_sent_at where id=p_id;return jsonb_build_object('state','review_required','recorded',false);
  end if;
 end loop;
 select coalesce(sum((value->>'open')::numeric),0) into total from jsonb_array_elements(m.snapshot->'manifest');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send,collection_policy_version,stage_snapshot)
 values(m.id,m.owner,d->>'hotel',d->>'account_id',array(select jsonb_array_elements_text(d->'invoice_ids')),d->>'purpose',m.stage,p_sent_at,p_gmail_id,total,captured_version,captured_stage);
 for prev in select value from jsonb_array_elements(m.snapshot->'workflow') order by value->>'invoice_id' loop
  update public.ar_invoice_workflow set first_billing_date=case when d->>'purpose'='billing' then coalesce(first_billing_date,day) else first_billing_date end,
   last_reminder_stage=case when d->>'purpose'='collection' then m.stage else last_reminder_stage end,
   last_reminder_date=case when d->>'purpose'='collection' then day else last_reminder_date end,
   last_reminder_policy_version=case when d->>'purpose'='collection' then captured_version else last_reminder_policy_version end,
   last_reminder_stage_snapshot=case when d->>'purpose'='collection' then captured_stage else last_reminder_stage_snapshot end,revision=revision+1,updated_at=now()
  where hotel=prev->>'hotel' and account_id=prev->>'account_id' and invoice_id=prev->>'invoice_id' returning * into w;
  insert into ar_private.invoice_workflow_history values(w.hotel,w.account_id,w.invoice_id,w.revision,p_actor,to_jsonb(w)||jsonb_build_object('delivery_id',p_id,'source','gmail_sent'),now());
 end loop;
 update ar_private.mail_deliveries set state='sent',gmail_id=p_gmail_id,sent_at=p_sent_at,reason=null where id=p_id;
 return jsonb_build_object('state','sent','recorded',true);
end $$;

revoke all on function ar_private.mail_claim_before_threads(uuid,uuid,uuid,integer,text,text,text,jsonb) from public,anon,authenticated,service_role;

-- Template content keeps its original schema. policyVersion is a transient review fence.
alter function public.ar_template_save(uuid,uuid,integer,jsonb) set schema ar_private;
alter function ar_private.ar_template_save(uuid,uuid,integer,jsonb) rename to template_save_before_policy;
revoke all on function ar_private.template_save_before_policy(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
create function public.ar_template_save(p_actor uuid,p_id uuid,p_revision integer,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare content jsonb;t public.ar_email_templates;v integer;stage_proof jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 if p_id is null or p_revision is null or p_revision<0 or jsonb_typeof(p_content) is distinct from 'object' then return jsonb_build_object('error','template_invalid');end if;
 content:=p_content-'policyVersion';
 if jsonb_typeof(content->'purpose') is distinct from 'string' or content->>'purpose' not in('billing','collection') or jsonb_typeof(content->'archived') is distinct from 'boolean' then return jsonb_build_object('error','template_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2053));
 select * into t from public.ar_email_templates where id=p_id;
 if found and t.owner=p_actor and t.content=content and (t.revision=p_revision or t.revision=p_revision+1) then return ar_private.template_save_before_policy(p_actor,p_id,p_revision,content);end if;
 if content->>'purpose'='collection' then
  if jsonb_typeof(content->'stage') is distinct from 'string' or not exists(select 1 from ar_private.collection_stage_keys where key=content->>'stage') then return jsonb_build_object('error','template_invalid');end if;
  select version into v from ar_private.collection_policy_head where singleton for share;
  if p_content?'policyVersion' then
   if jsonb_typeof(p_content->'policyVersion') is distinct from 'number' or p_content->>'policyVersion' is distinct from v::text then return jsonb_build_object('error','template_policy_revision_conflict');end if;
  elsif v<>1 then return jsonb_build_object('error','template_policy_revision_conflict');end if;
  stage_proof:=ar_private.collection_policy_stage(v,content->>'stage',coalesce((content->>'archived')::boolean,false));
  if stage_proof is null then return jsonb_build_object('error','template_stage_retired');end if;
 elsif content->>'purpose'='billing' and content->'stage' is distinct from 'null'::jsonb then return jsonb_build_object('error','template_invalid');end if;
 return ar_private.template_save_before_policy(p_actor,p_id,p_revision,content);
exception when invalid_text_representation then return jsonb_build_object('error','template_invalid');
end $$;
revoke all on function public.ar_template_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ar_template_save(uuid,uuid,integer,jsonb) to service_role;

-- Preserve the existing invoker/RLS projection and expose captured workflow policy evidence.
create or replace view public.ar_collection_rows with (security_invoker=true) as
 select i.hotel,i.account_id,i.id,i.guest,i.invoice_no,i.folio_no,i.open,i.transaction_date,
 i.collection_role,i.collection_selectable,i.verification_state,a.name as account_name,a.type as account_type,
 case when w.invoice_id is null then null else jsonb_build_object('revision',w.revision,'billing_required',w.billing_required,'credit_term',w.credit_term,'first_billing_date',w.first_billing_date,'last_reminder_stage',w.last_reminder_stage,'last_reminder_date',w.last_reminder_date,'due_date',w.due_date,'last_reminder_policy_version',w.last_reminder_policy_version,'last_reminder_stage_snapshot',w.last_reminder_stage_snapshot) end as workflow
 from public.ar_invoices i left join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 where i.open>0;
revoke all on public.ar_collection_rows from public,anon;
grant select on public.ar_collection_rows to authenticated;
