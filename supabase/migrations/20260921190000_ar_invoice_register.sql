-- One linked invoice register: OPERA owns amounts; existing workflow/exception
-- rows own billing, reminders and notes. Only additional tracking facts live here.
alter table public.ar_invoice_workflow add column rules_manually_set boolean not null default false;
create table ar_private.invoice_tracking(
 hotel text not null,account_id text not null,invoice_id text not null,
 promised_date date,tracking_status text not null default '' check(tracking_status in('','Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other')),
 owner_name text not null default '' check(length(owner_name)<=160),reported_received numeric(16,2) check(reported_received>=0),
 revision integer not null default 0,updated_at timestamptz not null default now(),updated_by uuid,
 primary key(hotel,account_id,invoice_id),foreign key(hotel,account_id,invoice_id) references public.ar_invoice_workflow(hotel,account_id,invoice_id)
);
create table ar_private.invoice_register_hidden(actor uuid not null,hotel text not null,account_id text not null,invoice_id text not null,primary key(actor,hotel,account_id,invoice_id));
create table ar_private.invoice_register_commands(command_id uuid primary key,actor uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create table ar_private.invoice_register_history(id bigint generated always as identity primary key,actor uuid not null,hotel text not null,account_id text not null,invoice_id text not null,before_value jsonb not null,after_value jsonb not null,recorded_at timestamptz not null default now());
create index invoice_register_history_scope on ar_private.invoice_register_history(hotel,account_id,invoice_id,id desc);
alter table ar_private.invoice_tracking enable row level security;
alter table ar_private.invoice_register_hidden enable row level security;
alter table ar_private.invoice_register_commands enable row level security;
alter table ar_private.invoice_register_history enable row level security;
revoke all on ar_private.invoice_tracking,ar_private.invoice_register_hidden,ar_private.invoice_register_commands,ar_private.invoice_register_history from public,anon,authenticated,service_role;

-- A deliberate per-invoice override survives OPERA refresh and account defaults.
do $$declare d text;n text:='and w.settings_revision is null';begin
 d:=pg_get_functiondef('ar_private.apply_unassigned_billing_rules(text,text,text)'::regprocedure);
 if (length(d)-length(replace(d,n,'')))/length(n)<>1 then raise exception 'register_assignment_definition_drift';end if;
 execute replace(d,n,n||' and not w.rules_manually_set');
end $$;

create function ar_private.invoice_register_hotels(p_actor uuid,p_scope text) returns text[] language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;h text[];
begin
 m:=ar_private.access_member(p_actor);h:=ar_private.report_scope_hotels(p_scope);
 if m.email is null or cardinality(h)=0 or not h<@ar_private.access_hotels(m.regions) then raise exception 'register_forbidden';end if;
 return h;
end $$;

create view ar_private.invoice_register_source as
select i.hotel,i.account_id,i.id,a.name as account_name,a.account_no,a.type as account_type,i.guest,i.invoice_no,i.folio_no,i.transaction_date,i.original,i.open,i.age,i.aging,i.verification_state,i.collection_role,i.collection_selectable,
 to_jsonb(w) as workflow,w.revision as workflow_revision,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,w.last_reminder_stage,w.last_reminder_date,
 coalesce(t.revision,0) as tracking_revision,t.promised_date,coalesce(t.tracking_status,'') as tracking_status,coalesce(t.owner_name,'') as owner_name,t.reported_received::text,
 coalesce(e.revision,0) as exception_revision,coalesce(e.note,'') as note,greatest(t.updated_at,e.updated_at,w.updated_at) as edited_at
from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
left join ar_private.invoice_tracking t on t.hotel=i.hotel and t.account_id=i.account_id and t.invoice_id=i.id
left join public.ar_invoice_exceptions e on e.hotel=i.hotel and e.account_id=i.account_id and e.invoice_id=i.id;
revoke all on ar_private.invoice_register_source from public,anon,authenticated,service_role;

create function public.ar_invoice_register_get(p_actor uuid,p_hotel text,p_account text,p_invoice text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;h text[];
begin h:=ar_private.invoice_register_hotels(p_actor,p_hotel);
 if not p_hotel=any(h) then return jsonb_build_object('error','register_forbidden');end if;
 select to_jsonb(s)||jsonb_build_object('hidden',exists(select 1 from ar_private.invoice_register_hidden x where x.actor=p_actor and x.hotel=s.hotel and x.account_id=s.account_id and x.invoice_id=s.id)) into r from ar_private.invoice_register_source s where s.hotel=p_hotel and s.account_id=p_account and s.id=p_invoice;
 return coalesce(r,jsonb_build_object('error','register_missing'));
exception when others then if sqlerrm='register_forbidden' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;

create function public.ar_invoice_register_read(p_actor uuid,p_filter jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h text[];sort_key text:=p_filter->>'sort';direction text:=p_filter->>'direction';r jsonb;
begin
 h:=ar_private.invoice_register_hotels(p_actor,p_filter->>'hotel');
 if sort_key is null or sort_key not in('hotel','account_name','guest','invoice_no','folio_no','transaction_date','original','open','age','aging','billing_required','credit_term','first_billing_date','due_date','last_reminder_stage','last_reminder_date','promised_date','tracking_status','owner_name','reported_received','note','edited_at') or direction not in('asc','desc') or (p_filter->>'offset')::bigint not between 0 and 2147483647 or (p_filter->>'limit')::int not between 1 and 100 or length(p_filter->>'search')>200 or p_filter->>'balance' not in('open','all','cleared','credit') or p_filter->>'visibility' not in('visible','hidden','all') then return jsonb_build_object('error','register_invalid');end if;
 execute format($query$
 with base as materialized (
 select s.*,exists(select 1 from ar_private.invoice_register_hidden x where x.actor=$1 and x.hotel=s.hotel and x.account_id=s.account_id and x.invoice_id=s.id) as hidden
 from ar_private.invoice_register_source s where s.hotel=any($2) and s.collection_role<>'child'
 and ($3->>'account' is null or s.account_id=$3->>'account') and ($3->>'type' is null or s.account_type=$3->>'type')
 and (coalesce($3->>'search','')='' or strpos(lower(concat_ws(' ',s.account_name,s.account_no,s.guest,s.invoice_no,s.folio_no,s.owner_name,s.note)),lower($3->>'search'))>0)
 and ($3->>'balance'='all' or $3->>'balance'='open' and s.open<>0 or $3->>'balance'='credit' and s.open<0 or $3->>'balance'='cleared' and s.open=0 and s.verification_state in('verified','cleared'))
 and ($3->>'billing'='all' or $3->>'billing'='required' and s.billing_required or $3->>'billing'='not_required' and s.billing_required=false or $3->>'billing'='unconfigured' and s.billing_required is null or $3->>'billing'='billed' and s.first_billing_date is not null or $3->>'billing'='unbilled' and s.billing_required and s.first_billing_date is null)
 and ($3->>'tracking'='all' or s.tracking_status=$3->>'tracking')
 ), matched as materialized (select * from base where $3->>'visibility'='all' or hidden=($3->>'visibility'='hidden')),
 paged as (select * from matched order by %s %s nulls last,hotel,account_id,id offset ($3->>'offset')::int limit ($3->>'limit')::int)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'), 'total',(select count(*) from matched),'hiddenTotal',(select count(*) from base where hidden),'summary',jsonb_build_object('invoices',(select count(*) from matched),'open',(select coalesce(sum(open),0) from matched),'unverified',(select count(*) from matched where verification_state not in('verified','cleared'))))
 $query$,case when sort_key='reported_received' then 'reported_received::numeric' when sort_key in('invoice_no','folio_no') then format('case when %1$I ~ ''^[0-9]+$'' then length(ltrim(%1$I,''0'')) end %2$s nulls last,%1$I',sort_key,direction) else format('%I',sort_key) end,direction) into r using p_actor,h,p_filter;
 return r;
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','register_invalid');when others then if sqlerrm='register_forbidden' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;

create function ar_private.invoice_register_values(r jsonb) returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('billingRequired',r->'billing_required','creditTerm',r->'credit_term','firstBillingDate',r->'first_billing_date','lastReminderStage',r->'last_reminder_stage','lastReminderDate',r->'last_reminder_date','promisedDate',r->'promised_date','trackingStatus',r->'tracking_status','ownerName',r->'owner_name','reportedReceived',r->'reported_received','note',r->'note');
$$;

create function public.ar_invoice_register_save(p_actor uuid,p_hotel text,p_account text,p_invoice text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text[];cmd uuid;prior ar_private.invoice_register_commands;request jsonb;v jsonb;before_row jsonb;r jsonb;w public.ar_invoice_workflow;e public.ar_invoice_exceptions;t ar_private.invoice_tracking;owner_id uuid;rules_changed boolean;workflow_changed boolean;today date:=(now() at time zone 'Asia/Bangkok')::date;requirement boolean;term integer;bill date;stage text;sent date;promise date;received numeric(16,2);
begin
 h:=ar_private.invoice_register_hotels(p_actor,p_hotel);if not p_hotel=any(h) then raise exception 'register_forbidden';end if;
 owner_id:=ar_private.access_owner();v:=p_input->'values';cmd:=(p_input->>'commandId')::uuid;
 if cmd is null or jsonb_typeof(v)<>'object' or v-array['billingRequired','creditTerm','firstBillingDate','lastReminderStage','lastReminderDate','promisedDate','trackingStatus','ownerName','reportedReceived','note']<>'{}' or not(v?&array['billingRequired','creditTerm','firstBillingDate','lastReminderStage','lastReminderDate','promisedDate','trackingStatus','ownerName','reportedReceived','note']) or jsonb_typeof(v->'billingRequired') not in('boolean','null') or jsonb_typeof(v->'creditTerm') not in('number','null') or length(v->>'note')>4000 or length(v->>'ownerName')>160 or v->>'trackingStatus' not in('','Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then raise exception 'register_invalid';end if;
 requirement:=(v->>'billingRequired')::boolean;term:=(v->>'creditTerm')::integer;bill:=(v->>'firstBillingDate')::date;stage:=v->>'lastReminderStage';sent:=(v->>'lastReminderDate')::date;promise:=(v->>'promisedDate')::date;received:=(v->>'reportedReceived')::numeric;
 if term<0 or term>3650 or term::numeric is distinct from (v->>'creditTerm')::numeric or received<0 or received is distinct from (v->>'reportedReceived')::numeric or (stage is null)<>(sent is null) or bill>today or sent>today or stage is not null and not exists(select 1 from ar_private.collection_stage_keys where key=stage) then raise exception 'register_invalid';end if;
 request:=jsonb_build_object('hotel',p_hotel,'account',p_account,'invoice',p_invoice,'input',p_input);
 perform pg_advisory_xact_lock(hashtextextended(cmd::text,916));
 select * into prior from ar_private.invoice_register_commands where command_id=cmd;
 if found then if prior.actor<>p_actor or prior.input<>request then raise exception 'register_command_conflict';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 -- Match the existing mail/history lock order; lock workflow before note state.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,735));
 select * into w from public.ar_invoice_workflow where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice for update;
 if not found then raise exception 'register_missing';end if;
 select * into e from public.ar_invoice_exceptions where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice for update;
 select * into t from ar_private.invoice_tracking where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice for update;
 if w.revision is distinct from (p_input->>'workflowRevision')::int or coalesce(e.revision,0) is distinct from (p_input->>'exceptionRevision')::int or coalesce(t.revision,0) is distinct from (p_input->>'revision')::int then raise exception 'register_revision_conflict';end if;
 before_row:=public.ar_invoice_register_get(p_actor,p_hotel,p_account,p_invoice);
 rules_changed:=(w.billing_required,w.credit_term) is distinct from (requirement,term);
 workflow_changed:=rules_changed or (w.first_billing_date,w.last_reminder_stage,w.last_reminder_date) is distinct from (bill,stage,sent);
 if workflow_changed and not exists(select 1 from public.ar_invoices where hotel=p_hotel and account_id=p_account and id=p_invoice and collection_role in('standalone','parent') and verification_state in('verified','cleared')) then raise exception 'register_source_changed';end if;
 if workflow_changed then
  update public.ar_invoice_workflow set billing_required=requirement,credit_term=term,first_billing_date=bill,last_reminder_stage=stage,last_reminder_date=sent,rules_manually_set=rules_manually_set or rules_changed,revision=revision+1,updated_at=now() where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice returning * into w;
  insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(p_hotel,p_account,p_invoice,w.revision,p_actor,to_jsonb(w));
 end if;
 if coalesce(e.note,'') is distinct from v->>'note' then
  r:=public.ar_invoice_exception_command(owner_id,p_hotel,p_account,p_invoice,jsonb_build_object('commandId',cmd,'revision',coalesce(e.revision,0),'confirmed',true,'action','set_notes','reason','Manual invoice register edit','note',v->>'note','dispute',coalesce(e.dispute,'')));
  if r?'error' then raise exception 'register_revision_conflict';end if;
 end if;
 insert into ar_private.invoice_tracking(hotel,account_id,invoice_id,promised_date,tracking_status,owner_name,reported_received,revision,updated_by) values(p_hotel,p_account,p_invoice,promise,v->>'trackingStatus',v->>'ownerName',received,coalesce(t.revision,0)+1,p_actor)
 on conflict(hotel,account_id,invoice_id) do update set promised_date=excluded.promised_date,tracking_status=excluded.tracking_status,owner_name=excluded.owner_name,reported_received=excluded.reported_received,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 r:=public.ar_invoice_register_get(p_actor,p_hotel,p_account,p_invoice);
 insert into ar_private.invoice_register_history(actor,hotel,account_id,invoice_id,before_value,after_value) values(p_actor,p_hotel,p_account,p_invoice,ar_private.invoice_register_values(before_row),ar_private.invoice_register_values(r));
 r:=jsonb_build_object('row',r);
 insert into ar_private.invoice_register_commands(command_id,actor,input,result) values(cmd,p_actor,request,r);return r;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('error','register_invalid');when others then if sqlerrm like 'register_%' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;

create function public.ar_invoice_register_visibility(p_actor uuid,p_scope text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text[];item jsonb;cmd uuid;prior ar_private.invoice_register_commands;request jsonb;r jsonb;hidden boolean;
begin
 h:=ar_private.invoice_register_hotels(p_actor,p_scope);cmd:=(p_input->>'commandId')::uuid;hidden:=(p_input->>'hidden')::boolean;
 if cmd is null or hidden is null or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 100 then raise exception 'register_invalid';end if;
 request:=jsonb_build_object('scope',p_scope,'visibility',p_input);perform pg_advisory_xact_lock(hashtextextended(cmd::text,916));
 select * into prior from ar_private.invoice_register_commands where command_id=cmd;
 if found then if prior.actor<>p_actor or prior.input<>request then raise exception 'register_command_conflict';end if;return prior.result;end if;
 for item in select value from jsonb_array_elements(p_input->'rows') loop
  if not coalesce(item->>'hotel'=any(h),false) then raise exception 'register_forbidden';end if;
  if not exists(select 1 from public.ar_invoices where hotel=item->>'hotel' and account_id=item->>'accountId' and id=item->>'invoiceId') then raise exception 'register_missing';end if;
  if hidden then insert into ar_private.invoice_register_hidden values(p_actor,item->>'hotel',item->>'accountId',item->>'invoiceId') on conflict do nothing;
  else delete from ar_private.invoice_register_hidden where actor=p_actor and hotel=item->>'hotel' and account_id=item->>'accountId' and invoice_id=item->>'invoiceId';end if;
 end loop;
 r:=jsonb_build_object('changed',jsonb_array_length(p_input->'rows'),'hidden',hidden);
 insert into ar_private.invoice_register_commands values(cmd,p_actor,request,r,now());return r;
exception when invalid_text_representation then return jsonb_build_object('error','register_invalid');when others then if sqlerrm like 'register_%' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;

create function public.ar_invoice_register_history(p_actor uuid,p_hotel text,p_account text,p_invoice text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h text[];r jsonb;
begin h:=ar_private.invoice_register_hotels(p_actor,p_hotel);if not p_hotel=any(h) then raise exception 'register_forbidden';end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','register_invalid');end if;
 select jsonb_build_object('total',(select count(*) from ar_private.invoice_register_history where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice),'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into r from(select h.id,h.recorded_at,h.before_value,h.after_value,coalesce(u.email,'Staff') as actor from ar_private.invoice_register_history h left join auth.users u on u.id=h.actor where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice order by h.id desc offset p_offset limit 20)x;return r;
exception when others then if sqlerrm='register_forbidden' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;
revoke all on function ar_private.invoice_register_hotels(uuid,text),ar_private.invoice_register_values(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ar_invoice_register_get(uuid,text,text,text),public.ar_invoice_register_read(uuid,jsonb),public.ar_invoice_register_save(uuid,text,text,text,jsonb),public.ar_invoice_register_visibility(uuid,text,jsonb),public.ar_invoice_register_history(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ar_invoice_register_get(uuid,text,text,text),public.ar_invoice_register_read(uuid,jsonb),public.ar_invoice_register_save(uuid,text,text,text,jsonb),public.ar_invoice_register_visibility(uuid,text,jsonb),public.ar_invoice_register_history(uuid,text,text,text,integer) to service_role;
