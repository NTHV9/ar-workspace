-- DRAFT: additive invoice exception metadata. Apply only after root review.
-- Never changes invoice money, billing/reminder history, or actual SENT reconciliation.
create table public.ar_invoice_exceptions(
 hotel text not null check(hotel in('KAT','TSK')),account_id text not null,invoice_id text not null,
 revision integer not null default 0 check(revision>=0),note text not null default '' check(length(note)<=4000),dispute text not null default '' check(length(dispute)<=4000),
 held boolean not null default false,hold_reason text,hold_review_date date,
 needs_review boolean not null default false,review_reason text,reopened_at timestamptz,updated_at timestamptz not null default now(),
 primary key(hotel,account_id,invoice_id),check(not held or hold_reason is not null and length(btrim(hold_reason))>0),check(not needs_review or review_reason is not null)
);
create table ar_private.invoice_exception_history(
 hotel text not null,account_id text not null,invoice_id text not null,revision integer not null,
 actor uuid,action text not null,reason text not null,snapshot jsonb not null,transition jsonb,recorded_at timestamptz not null default now(),
 primary key(hotel,account_id,invoice_id,revision)
);
create table ar_private.invoice_exception_commands(
 actor uuid not null,command_id uuid not null,hotel text not null,account_id text not null,invoice_id text not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor,command_id)
);
-- Retain the last verified balance through missing/error observations. These are
-- observation times, not payment dates; no historical clearance date is inferred.
create table ar_private.invoice_verified_balances(
 hotel text not null,account_id text not null,invoice_id text not null,last_open numeric(18,2) not null,
 verified_at timestamptz not null,zero_since timestamptz,primary key(hotel,account_id,invoice_id)
);
alter table ar_private.invoice_verified_balances enable row level security;
revoke all on ar_private.invoice_verified_balances from public,anon,authenticated,service_role;
insert into ar_private.invoice_verified_balances(hotel,account_id,invoice_id,last_open,verified_at,zero_since)
select hotel,account_id,id,open,synced_at,case when open=0 then now() end from public.ar_invoices where verification_state in('verified','cleared');
alter table public.ar_invoice_exceptions enable row level security;
alter table ar_private.invoice_exception_history enable row level security;
alter table ar_private.invoice_exception_commands enable row level security;
revoke all on public.ar_invoice_exceptions,ar_private.invoice_exception_history,ar_private.invoice_exception_commands from public,anon,authenticated,service_role;
grant select on public.ar_invoice_exceptions to authenticated;
create policy invoice_exception_member_read on public.ar_invoice_exceptions for select to authenticated using((select ar_private.is_member()));

create function ar_private.invoice_exception_actor(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false));
$$;
create function ar_private.invoice_exception_scope(p_hotel text,p_account text,p_invoice text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_hotel in('KAT','TSK') and length(p_account) between 1 and 200 and length(p_invoice) between 1 and 200 and p_account=btrim(p_account) and p_invoice=btrim(p_invoice) and p_account!~'[[:cntrl:]]' and p_invoice!~'[[:cntrl:]]' and p_account!~'^[[:space:]]|[[:space:]]$' and p_invoice!~'^[[:space:]]|[[:space:]]$',false);
$$;
create function ar_private.invoice_exception_json(p_hotel text,p_account text,p_invoice text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('hotel',p_hotel,'accountId',p_account,'invoiceId',p_invoice,'revision',coalesce(e.revision,0),'note',coalesce(e.note,''),'dispute',coalesce(e.dispute,''),'held',coalesce(e.held,false),'holdReason',e.hold_reason,'holdReviewDate',e.hold_review_date,'needsReview',coalesce(e.needs_review,false),'reviewReason',e.review_reason,'reopenedAt',e.reopened_at,'updatedAt',e.updated_at,
 'source',jsonb_build_object('open',case when i.verification_state in('verified','cleared') then round(i.open,2)::text else null end,'verification',i.verification_state,'collectionRole',i.collection_role,'verifiedAt',case when i.verification_state in('verified','cleared') then i.synced_at else null end))
 from (values(1)) anchor(n)
 left join public.ar_invoice_exceptions e on e.hotel=p_hotel and e.account_id=p_account and e.invoice_id=p_invoice
 left join public.ar_invoices i on i.hotel=p_hotel and i.account_id=p_account and i.id=p_invoice
 where e.invoice_id is not null or i.id is not null;
$$;
create function ar_private.invoice_exception_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'invoice_exception_audit_immutable';end$$;
create trigger invoice_exception_history_immutable before update or delete on ar_private.invoice_exception_history for each row execute function ar_private.invoice_exception_immutable();
create trigger invoice_exception_command_immutable before update or delete on ar_private.invoice_exception_commands for each row execute function ar_private.invoice_exception_immutable();

create function public.ar_invoice_exception_get(p_actor uuid,p_hotel text,p_account_id text,p_invoice_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','exception_forbidden');end if;
 if not ar_private.invoice_exception_scope(p_hotel,p_account_id,p_invoice_id) then return jsonb_build_object('error','exception_invalid');end if;
 return ar_private.invoice_exception_json(p_hotel,p_account_id,p_invoice_id);
end $$;
create function public.ar_invoice_exception_history(p_actor uuid,p_hotel text,p_account_id text,p_invoice_id text,p_offset integer,p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','exception_forbidden');end if;
 if not ar_private.invoice_exception_scope(p_hotel,p_account_id,p_invoice_id) or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','exception_invalid');end if;
 if ar_private.invoice_exception_json(p_hotel,p_account_id,p_invoice_id) is null then return jsonb_build_object('error','exception_missing');end if;
 select count(*) into n from ar_private.invoice_exception_history where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id;
 select coalesce(jsonb_agg(jsonb_build_object('revision',h.revision,'action',h.action,'reason',h.reason,'recordedAt',h.recorded_at,'snapshot',h.snapshot,'transition',h.transition) order by h.revision desc),'[]') into rows from(select * from ar_private.invoice_exception_history where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id order by revision desc limit p_limit offset p_offset) h;
 return jsonb_build_object('rows',rows,'total',n);
end $$;
create function public.ar_invoice_exception_command_get(p_actor uuid,p_command uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c ar_private.invoice_exception_commands;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','exception_forbidden');end if;
 if p_command is null then return jsonb_build_object('error','exception_invalid');end if;
 select * into c from ar_private.invoice_exception_commands where actor=p_actor and command_id=p_command;
 if not found then return jsonb_build_object('complete',false);end if;
 return jsonb_build_object('complete',true,'hotel',c.hotel,'accountId',c.account_id,'invoiceId',c.invoice_id,'revision',c.result->'revision');
end $$;

create function public.ar_invoice_exception_command(p_actor uuid,p_hotel text,p_account_id text,p_invoice_id text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ar_invoice_exceptions;c ar_private.invoice_exception_commands;i public.ar_invoices;cmd uuid;expected integer;act text;why text;review_date date;allowed text[];k text;result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','exception_forbidden');end if;
 if not ar_private.invoice_exception_scope(p_hotel,p_account_id,p_invoice_id) or jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'commandId') is distinct from 'string' or p_input->>'commandId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('error','exception_invalid');end if;
 cmd:=(p_input->>'commandId')::uuid;
 -- Same lock as mail handoff. Exact completed commands remain recoverable after later edits.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into c from ar_private.invoice_exception_commands where actor=p_actor and command_id=cmd;
 if found then
  if row(c.hotel,c.account_id,c.invoice_id,c.input) is distinct from row(p_hotel,p_account_id,p_invoice_id,p_input) then return jsonb_build_object('error','exception_command_conflict');end if;
  return c.result;
 end if;
 act:=p_input->>'action';allowed:=array['commandId','revision','confirmed','action','reason']||case act when 'set_notes' then array['note','dispute'] when 'hold' then array['reviewDate'] else '{}'::text[] end;
 if act is null or act not in('set_notes','hold','release','acknowledge_reopen') or p_input-allowed<>'{}'::jsonb or not(p_input?&array['commandId','revision','confirmed','action','reason']) or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'revision') is distinct from 'number' or p_input->>'revision'!~'^(0|[1-9][0-9]{0,9})$' then return jsonb_build_object('error','exception_invalid');end if;
 if (p_input->>'revision')::bigint>2147483647 then return jsonb_build_object('error','exception_invalid');end if;expected:=(p_input->>'revision')::integer;
 if jsonb_typeof(p_input->'reason') is distinct from 'string' or length(p_input->>'reason') not between 1 and 1000 or p_input->>'reason'~'^[[:space:]]*$' or p_input->>'reason'~E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then return jsonb_build_object('error','exception_reason_required');end if;why:=btrim(p_input->>'reason');
 if act='set_notes' then
  foreach k in array array['note','dispute'] loop
   if jsonb_typeof(p_input->k) is distinct from 'string' or length(p_input->>k)>4000 or p_input->>k~E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then return jsonb_build_object('error','exception_invalid');end if;
  end loop;
 elsif act='hold' then
  if not(p_input?'reviewDate') or jsonb_typeof(p_input->'reviewDate') not in('string','null') then return jsonb_build_object('error','exception_invalid');end if;
  if p_input->'reviewDate'<>'null'::jsonb then
   if p_input->>'reviewDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_input->>'reviewDate' like '0000-%' then return jsonb_build_object('error','exception_invalid');end if;
   review_date:=(p_input->>'reviewDate')::date;if to_char(review_date,'YYYY-MM-DD')<>p_input->>'reviewDate' then return jsonb_build_object('error','exception_invalid');end if;
  end if;
 end if;
 -- All paths lock source first, then exception metadata. This also serializes source-trigger reopen.
 select * into i from public.ar_invoices where hotel=p_hotel and account_id=p_account_id and id=p_invoice_id for update;
 if not found and not exists(select 1 from public.ar_invoice_exceptions where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id) then return jsonb_build_object('error','exception_missing');end if;
 select * into e from public.ar_invoice_exceptions where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id for update;
 if coalesce(e.revision,0)<>expected or e.revision=2147483647 then return jsonb_build_object('error','exception_revision_conflict');end if;
 if act='release' and not coalesce(e.held,false) or act='acknowledge_reopen' and not coalesce(e.needs_review,false) then return jsonb_build_object('error','exception_state_conflict');end if;
 if act='acknowledge_reopen' and (i.id is null or i.verification_state not in('verified','cleared')) then return jsonb_build_object('error','exception_source_unverified');end if;
 insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id) values(p_hotel,p_account_id,p_invoice_id) on conflict do nothing;
 update public.ar_invoice_exceptions set revision=revision+1,
  note=case when act='set_notes' then btrim(p_input->>'note') else note end,dispute=case when act='set_notes' then btrim(p_input->>'dispute') else dispute end,
  held=case when act='hold' then true when act='release' then false else held end,
  hold_reason=case when act='hold' then why when act='release' then null else hold_reason end,
  hold_review_date=case when act='hold' then review_date when act='release' then null else hold_review_date end,
  needs_review=case when act='acknowledge_reopen' then false else needs_review end,review_reason=case when act='acknowledge_reopen' then null else review_reason end,updated_at=now()
 where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id returning * into e;
 result:=ar_private.invoice_exception_json(p_hotel,p_account_id,p_invoice_id);
 insert into ar_private.invoice_exception_history(hotel,account_id,invoice_id,revision,actor,action,reason,snapshot) values(p_hotel,p_account_id,p_invoice_id,e.revision,p_actor,act,why,result);
 insert into ar_private.invoice_exception_commands(actor,command_id,hotel,account_id,invoice_id,input,result) values(p_actor,cmd,p_hotel,p_account_id,p_invoice_id,p_input,result);
 return result;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or check_violation then return jsonb_build_object('error','exception_invalid');
end $$;

create function ar_private.invoice_reopened_review() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.ar_invoice_exceptions;prior ar_private.invoice_verified_balances;previous_open numeric;
begin
 if tg_op='UPDATE' and row(old.hotel,old.account_id,old.id) is distinct from row(new.hotel,new.account_id,new.id) then return new;end if;
 if new.verification_state not in('verified','cleared') then return new;end if;
 select * into prior from ar_private.invoice_verified_balances where hotel=new.hotel and account_id=new.account_id and invoice_id=new.id for update;
 previous_open:=prior.last_open;
 if prior.invoice_id is null and tg_op='UPDATE' and old.verification_state in('verified','cleared') then previous_open:=old.open;end if;
 insert into ar_private.invoice_verified_balances(hotel,account_id,invoice_id,last_open,verified_at,zero_since)
 values(new.hotel,new.account_id,new.id,new.open,new.synced_at,case when new.open=0 then case when previous_open=0 then coalesce(prior.zero_since,now()) else now() end end)
 on conflict(hotel,account_id,invoice_id) do update set last_open=excluded.last_open,verified_at=excluded.verified_at,zero_since=excluded.zero_since;
 if previous_open is distinct from 0 or new.open=0 or new.verification_state<>'verified' then return new;end if;
 insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,revision,needs_review,review_reason,reopened_at)
 values(new.hotel,new.account_id,new.id,1,true,'Verified OPERA balance reopened',now())
 on conflict(hotel,account_id,invoice_id) do update set revision=public.ar_invoice_exceptions.revision+1,needs_review=true,review_reason=excluded.review_reason,reopened_at=now(),updated_at=now() returning * into e;
 insert into ar_private.invoice_exception_history(hotel,account_id,invoice_id,revision,actor,action,reason,snapshot,transition)
 values(new.hotel,new.account_id,new.id,e.revision,null,'source_reopened','Verified zero balance became nonzero in OPERA',ar_private.invoice_exception_json(new.hotel,new.account_id,new.id),jsonb_build_object('fromOpen',round(previous_open,2)::text,'toOpen',round(new.open,2)::text));
 return new;
end $$;
create trigger ar_invoice_reopened_review after insert or update of open,verification_state,synced_at on public.ar_invoices for each row execute function ar_private.invoice_reopened_review();

create function ar_private.invoice_exception_handoff(p_hotel text,p_account text,p_ids text[]) returns text language plpgsql set search_path='' as $$
begin
 -- Invoice locks fence a concurrent source-update trigger even when no exception row existed.
 perform i.id from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account and i.id=any(p_ids) order by i.id for share;
 perform e.invoice_id from public.ar_invoice_exceptions e where e.hotel=p_hotel and e.account_id=p_account and e.invoice_id=any(p_ids) order by e.invoice_id for share;
 if exists(select 1 from public.ar_invoice_exceptions where hotel=p_hotel and account_id=p_account and invoice_id=any(p_ids) and needs_review) then return 'email_invoice_review_required';end if;
 if exists(select 1 from public.ar_invoice_exceptions where hotel=p_hotel and account_id=p_account and invoice_id=any(p_ids) and held) then return 'email_invoice_on_hold';end if;
 return null;
end $$;
alter function public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb) set schema ar_private;
alter function ar_private.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb) rename to mail_claim_before_exceptions;
revoke all on function ar_private.mail_claim_before_exceptions(uuid,uuid,uuid,integer,text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;blocked text;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 if p_mode in('draft','send') and not exists(select 1 from ar_private.mail_deliveries where id=p_id and owner=p_actor) and not exists(select 1 from ar_private.mail_deliveries where draft_id=p_draft and revision=p_revision and owner=p_actor) then
  select * into d from public.ar_email_drafts where id=p_draft and owner=p_actor for update;
  if found then blocked:=ar_private.invoice_exception_handoff(d.hotel,d.account_id,d.invoice_ids);if blocked is not null then return jsonb_build_object('error',blocked);end if;end if;
 end if;
 return ar_private.mail_claim_before_exceptions(p_actor,p_id,p_draft,p_revision,p_mode,p_stage,p_message_id,p_expected);
end $$;
alter function public.ar_gmail_attempt_claim(uuid,uuid,integer,text) set schema ar_private;
alter function ar_private.ar_gmail_attempt_claim(uuid,uuid,integer,text) rename to gmail_attempt_claim_before_exceptions;
revoke all on function ar_private.gmail_attempt_claim_before_exceptions(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
create function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;blocked text;
begin
 if not ar_private.invoice_exception_actor(p_owner) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,735));
 select * into d from public.ar_email_drafts where id=p_draft and owner=p_owner for update;
 if found and not exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision) then blocked:=ar_private.invoice_exception_handoff(d.hotel,d.account_id,d.invoice_ids);if blocked is not null then return jsonb_build_object('error',blocked);end if;end if;
 return ar_private.gmail_attempt_claim_before_exceptions(p_owner,p_draft,p_revision,p_message_id);
end $$;

revoke all on function ar_private.invoice_exception_actor(uuid),ar_private.invoice_exception_scope(text,text,text),ar_private.invoice_exception_json(text,text,text),ar_private.invoice_exception_immutable(),ar_private.invoice_reopened_review(),ar_private.invoice_exception_handoff(text,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.ar_invoice_exception_get(uuid,text,text,text),public.ar_invoice_exception_history(uuid,text,text,text,integer,integer),public.ar_invoice_exception_command_get(uuid,uuid),public.ar_invoice_exception_command(uuid,text,text,text,jsonb),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ar_invoice_exception_get(uuid,text,text,text),public.ar_invoice_exception_history(uuid,text,text,text,integer,integer),public.ar_invoice_exception_command_get(uuid,uuid),public.ar_invoice_exception_command(uuid,text,text,text,jsonb),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text) to service_role;
