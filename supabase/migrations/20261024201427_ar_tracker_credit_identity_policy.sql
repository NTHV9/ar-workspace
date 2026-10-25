-- Owner-approved invoice-local Sheet credit authority. No financial/provider/date writes.
create table ar_private.tracker_invoice_credit(
 hotel text not null,account_id text not null,invoice_id text not null,
 override_term integer check(override_term between 0 and 3650),region text not null,row_key text not null,
 observed_value jsonb,updated_at timestamptz not null default clock_timestamp(),primary key(hotel,account_id,invoice_id)
);
create table ar_private.tracker_credit_fills(
 id uuid primary key default gen_random_uuid(),region text not null,row_key text not null,
 hotel text not null,account_id text not null,invoice_id text not null,identity jsonb not null,
 value integer not null check(value between 0 and 3650),
 state text not null default 'pending' check(state in('pending','uncertain','written','conflict','held','cancelled')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index tracker_invoice_credit_origin on ar_private.tracker_invoice_credit(region,row_key,updated_at desc);
create unique index tracker_credit_fill_active on ar_private.tracker_credit_fills(region,row_key) where state in('pending','uncertain','held','conflict');
create index tracker_credit_fill_history on ar_private.tracker_credit_fills(region,row_key,created_at desc);
alter table ar_private.tracker_rows add column policy_identity_verified boolean not null default false;
alter table ar_private.tracker_rows add column policy_credit_writable boolean not null default false;
create table ar_private.tracker_identity_transfers(
 id bigint generated always as identity primary key,region text not null,row_key text not null,
 old_hotel text,old_account text,old_invoice text,new_hotel text not null,new_account text not null,new_invoice text not null,
 old_identity jsonb,new_identity jsonb,actor uuid not null,observed_at timestamptz not null default now()
);
alter table ar_private.tracker_invoice_credit enable row level security;
alter table ar_private.tracker_credit_fills enable row level security;
alter table ar_private.tracker_identity_transfers enable row level security;
revoke all on ar_private.tracker_invoice_credit,ar_private.tracker_credit_fills,ar_private.tracker_identity_transfers from public,anon,authenticated,service_role;

create function ar_private.tracker_credit_guard() returns trigger language plpgsql set search_path='' as $$
declare term integer;
begin
 select override_term into term from ar_private.tracker_invoice_credit where hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id;
 if term is not null then new.credit_term:=term;end if;return new;
end $$;
create trigger tracker_credit_guard before insert or update of credit_term on public.ar_invoice_workflow for each row execute function ar_private.tracker_credit_guard();

-- Full corroboration permits an Account reassignment. Multiple current candidates
-- remain ambiguous even if one happens to share the old Account number.
create function ar_private.tracker_policy_match(p_row jsonb) returns table(account_id text,invoice_id text)
language sql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
 with candidates as materialized(
  select i.account_id,i.id,i.open,i.verification_state,coalesce(a.account_no,a.id) as account_no
  from public.ar_invoices i join public.ar_accounts a on (a.hotel,a.id)=(i.hotel,i.account_id)
  where i.hotel=p_row->>'hotel' and i.invoice_no=p_row->>'invoiceNo'
  and (nullif(p_row->>'folio','') is null or i.folio_no=p_row->>'folio')
  and (nullif(p_row->>'transactionDate','') is null or i.transaction_date=(p_row->>'transactionDate')::date)
  and (coalesce(a.account_no,a.id)=p_row->>'accountNo' or nullif(p_row->>'folio','') is not null and nullif(p_row->>'transactionDate','') is not null)
 ), live as materialized(select * from candidates where open<>0 or verification_state not in('verified','cleared')), chosen as materialized(
  select * from live union all select * from candidates where not exists(select 1 from live) and (account_no=p_row->>'accountNo' or nullif(p_row->>'accountNo','') is null and nullif(p_row->>'folio','') is not null and nullif(p_row->>'transactionDate','') is not null)
 ) select c.account_id,c.id from chosen c where (select count(*) from chosen)=1 and ar_private.tracker_source_eligible(p_row->>'hotel',c.account_id,c.id);
$$;

create function ar_private.tracker_adopt_credit(p_actor uuid,p_region text,p_key text,p_value jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r ar_private.tracker_rows;w public.ar_invoice_workflow;prior ar_private.tracker_invoice_credit;origin ar_private.tracker_invoice_credit;default_term integer;term integer;explicit_term integer;echo boolean;v text;
begin
 select * into strict r from ar_private.tracker_rows where region=p_region and row_key=p_key for update;
 select * into strict w from public.ar_invoice_workflow where (hotel,account_id,invoice_id)=(r.hotel,r.account_id,r.invoice_id) for update;
 select credit_term into default_term from public.ar_account_settings where (hotel,account_id)=(r.hotel,r.account_id);
 select * into prior from ar_private.tracker_invoice_credit where (hotel,account_id,invoice_id)=(r.hotel,r.account_id,r.invoice_id);
 select * into origin from ar_private.tracker_invoice_credit where region=p_region and row_key=p_key order by updated_at desc,(account_id=r.account_id and invoice_id=r.invoice_id) desc limit 1;
 v:=p_value#>>'{}';
 if v is not null and (v!~'^[0-9]{1,4}$' or v::integer not between 0 and 3650) then raise exception 'tracker_credit_invalid';end if;
 select exists(select 1 from ar_private.tracker_credit_fills j where j.region=p_region and j.row_key=p_key and j.value::text=v and j.state in('uncertain','written')
  and origin.hotel is not null and origin.override_term is null and (origin.observed_value#>>'{}'=v or origin.observed_value#>>'{}' is null and j.created_at>=origin.updated_at)
  and (j.identity->>'hotel',j.identity->>'invoiceNo',j.identity->>'folio',j.identity->>'transactionDate')=(r.identity->>'hotel',r.identity->>'invoiceNo',r.identity->>'folio',r.identity->>'transactionDate')) into echo;
 explicit_term:=case when v is not null and not echo then v::integer end;
 term:=coalesce(explicit_term,default_term);
 insert into ar_private.tracker_invoice_credit(hotel,account_id,invoice_id,override_term,region,row_key,observed_value)
 values(r.hotel,r.account_id,r.invoice_id,explicit_term,p_region,p_key,p_value)
 on conflict(hotel,account_id,invoice_id) do update set override_term=excluded.override_term,region=excluded.region,row_key=excluded.row_key,observed_value=excluded.observed_value,updated_at=clock_timestamp()
 where (tracker_invoice_credit.override_term,tracker_invoice_credit.region,tracker_invoice_credit.row_key,tracker_invoice_credit.observed_value) is distinct from (excluded.override_term,excluded.region,excluded.row_key,excluded.observed_value);
 if (prior.override_term,w.credit_term) is distinct from (explicit_term,term) then
  update public.ar_invoice_workflow set credit_term=term,revision=revision+1,updated_at=now() where (hotel,account_id,invoice_id)=(r.hotel,r.account_id,r.invoice_id);
  insert into ar_private.tracker_history(region,row_key,field,source,actor,before_value,after_value) values(p_region,p_key,'S','sheet_credit',p_actor,to_jsonb(w.credit_term),to_jsonb(term));
 end if;
 if v is null and term is not null and not exists(select 1 from ar_private.tracker_credit_fills where region=p_region and row_key=p_key and state in('pending','uncertain','held','conflict')) then
  insert into ar_private.tracker_credit_fills(region,row_key,hotel,account_id,invoice_id,identity,value) values(p_region,p_key,r.hotel,r.account_id,r.invoice_id,r.identity,term);
 elsif v is not null then
  update ar_private.tracker_credit_fills set state=case when state='uncertain' and value::text=v and echo then 'written' else 'cancelled' end,updated_at=clock_timestamp() where region=p_region and row_key=p_key and state in('pending','uncertain','held','conflict');
 end if;
 return term;
end $$;

create function public.ar_tracker_credit_jobs(p_actor uuid,p_region text,p_lock uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 update ar_private.tracker_credit_fills j set state='cancelled',updated_at=clock_timestamp() where j.region=p_region and j.state in('pending','held','conflict')
 and not exists(select 1 from ar_private.tracker_rows r join public.ar_invoice_workflow w on (w.hotel,w.account_id,w.invoice_id)=(r.hotel,r.account_id,r.invoice_id)
  where r.region=j.region and r.row_key=j.row_key and r.present and r.identity=j.identity and (r.hotel,r.account_id,r.invoice_id)=(j.hotel,j.account_id,j.invoice_id)
  and w.credit_term=j.value and r.sheet_values->>'S' is null);
 update ar_private.tracker_credit_fills j set state='pending',updated_at=clock_timestamp() from ar_private.tracker_rows r
 where j.region=p_region and (r.region,r.row_key)=(j.region,j.row_key) and j.state in('held','conflict') and r.policy_identity_verified and r.policy_credit_writable;
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'rowKey',q.row_key,'identity',q.identity,'locator',q.locator,'value',q.value::text,'state',q.state)) from(
  select ranked.* from (select j.*,r.locator,row_number() over(partition by j.state order by j.updated_at,j.created_at,j.id) as position from ar_private.tracker_credit_fills j join ar_private.tracker_rows r on (r.region,r.row_key)=(j.region,j.row_key)
  where j.region=p_region and j.state in('pending','uncertain') and r.present and r.identity=j.identity
  and ar_private.tracker_source_eligible(r.hotel,r.account_id,r.invoice_id)
  and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.field in('S','identity') and c.status='pending')
  ) ranked where ranked.state<>'uncertain' or ranked.position<=5
  order by (ranked.state='uncertain') desc,ranked.updated_at,ranked.id limit 20)q),'[]'::jsonb);
end $$;
create function public.ar_tracker_credit_result(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j ar_private.tracker_credit_fills;
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 if p_state not in('uncertain','written','conflict','held') then raise exception 'tracker_credit_invalid';end if;
 select * into strict j from ar_private.tracker_credit_fills where id=p_id and region=p_region for update;
 if j.state='pending' and p_state='uncertain' and not exists(
  select 1 from ar_private.tracker_rows r join public.ar_invoice_workflow w on (w.hotel,w.account_id,w.invoice_id)=(r.hotel,r.account_id,r.invoice_id)
  where (r.region,r.row_key)=(j.region,j.row_key) and r.present and r.identity=j.identity and (r.hotel,r.account_id,r.invoice_id)=(j.hotel,j.account_id,j.invoice_id)
  and r.sheet_values->>'S' is null and w.credit_term=j.value and ar_private.tracker_source_eligible(r.hotel,r.account_id,r.invoice_id)
  and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.field in('S','identity') and c.status='pending')) then
  update ar_private.tracker_credit_fills set state='cancelled',updated_at=clock_timestamp() where id=j.id returning * into j;
 elsif j.state in('pending','uncertain') and (p_state<>'written' or j.state='uncertain') then
  update ar_private.tracker_credit_fills set state=p_state,updated_at=clock_timestamp() where id=j.id returning * into j;
 end if;return jsonb_build_object('state',j.state);
end $$;

create function ar_private.tracker_retire_closed_warnings(p_region text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update ar_private.tracker_conflicts c set status='resolved',resolved_at=now()
 from ar_private.tracker_rows r join public.ar_invoices i on (i.hotel,i.account_id,i.id)=(r.hotel,r.account_id,r.invoice_id)
 where c.region=p_region and c.region=r.region and c.row_key=r.row_key and c.status='pending' and r.present and r.policy_identity_verified
 and i.verification_state in('verified','cleared') and i.open=0 and i.synced_at between now()-interval '15 minutes' and now()
 and (r.identity->>'hotel',r.identity->>'invoiceNo',r.identity->>'folio',r.identity->>'transactionDate')=(i.hotel,i.invoice_no,i.folio_no,i.transaction_date::text)
 and not exists(select 1 from public.ar_invoices live where live.hotel=i.hotel and live.invoice_no=i.invoice_no and live.folio_no=i.folio_no and live.transaction_date=i.transaction_date and (live.open<>0 or live.verification_state not in('verified','cleared')));
 get diagnostics n=row_count;return n;
end $$;

-- Patch current qualified snapshot in place; retain all existing R/U/V/W authority
-- and uncertain-send fences. Every splice is checked against definition drift.
do $patch$
declare definition text;change record;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),chr(13),'');
 for change in select * from (values
 ($old$select count(*),min(i.account_id),min(i.id) into match_count,a,i from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
  where i.hotel=r->>'hotel' and i.invoice_no=r->>'invoiceNo' and (coalesce(a.account_no,a.id)=r->>'accountNo' or nullif(btrim(r->>'accountNo'),'') is null and nullif(r->>'invoiceNo','') is not null and nullif(r->>'folio','') is not null and nullif(r->>'transactionDate','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') and (nullif(r->>'folio','') is null or i.folio_no=r->>'folio') and (nullif(r->>'transactionDate','') is null or i.transaction_date=(r->>'transactionDate')::date);$old$,
 $new$select count(*),min(m.account_id),min(m.invoice_id) into match_count,a,i from ar_private.tracker_policy_match(r) m;$new$),
 ($old$or old.row_key is not null and old.identity is distinct from (r-array['fields','locator','rowKey','ambiguous','holdReason','reviewFence','issues','fieldHolds','formulaFields','blockedWriteFields'])$old$,
 $new$or old.row_key is not null and old.identity is distinct from (r-array['fields','locator','rowKey','ambiguous','holdReason','reviewFence','issues','fieldHolds','formulaFields','blockedWriteFields']) and not (
   nullif(r->>'folio','') is not null and nullif(r->>'transactionDate','') is not null and
   (old.identity->>'hotel',old.identity->>'invoiceNo',old.identity->>'folio',old.identity->>'transactionDate')=(r->>'hotel',r->>'invoiceNo',r->>'folio',r->>'transactionDate'))$new$),
 ($old$insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)$old$,
 $new$if match_count=1 and old.account_id is not null and (old.account_id,old.invoice_id) is distinct from (a,i) then
   insert into ar_private.tracker_identity_transfers(region,row_key,old_hotel,old_account,old_invoice,new_hotel,new_account,new_invoice,old_identity,new_identity,actor) values(p_region,r->>'rowKey',old.hotel,old.account_id,old.invoice_id,r->>'hotel',a,i,old.identity,r-array['fields','locator'],p_actor);
   old.baseline:='{}';old.web_values:='{}';
  end if;
  insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)$new$),
 ($old$account_id=coalesce(ar_private.tracker_rows.account_id,excluded.account_id),invoice_id=coalesce(ar_private.tracker_rows.invoice_id,excluded.invoice_id)$old$,
 $new$account_id=case when match_count=1 then excluded.account_id else ar_private.tracker_rows.account_id end,invoice_id=case when match_count=1 then excluded.invoice_id else ar_private.tracker_rows.invoice_id end,identity=case when match_count=1 then excluded.identity else ar_private.tracker_rows.identity end$new$),
 ($old$if coalesce(r->'fieldHolds','[]')?f then$old$,
 $new$if f='T' then perform ar_private.tracker_ledger_resolve(p_region,r->>'rowKey',array['T']);continue;end if;
   if coalesce(r->'fieldHolds','[]')?f then$new$),
 ($old$if match_count<>1 then
   perform ar_private.tracker_ledger_conflict$old$,
 $new$update ar_private.tracker_rows set policy_identity_verified=(match_count=1),policy_credit_writable=not(coalesce(r->'formulaFields','[]')?'S' or coalesce(r->'blockedWriteFields','[]')?'S' or coalesce(r->'fieldHolds','[]')?'S') where region=p_region and row_key=r->>'rowKey';
  if match_count<>1 then
   perform ar_private.tracker_ledger_conflict$new$),
 ($old$if f='Z' then
    if sv<>'null' then$old$,
 $new$if f='S' then
    perform ar_private.tracker_adopt_credit(p_actor,p_region,r->>'rowKey',sv);
    select * into w from public.ar_invoice_workflow where hotel=r->>'hotel' and account_id=a and invoice_id=i;
    merged:=merged||jsonb_build_object('S',w.credit_term);
    baseline_updates:=baseline_updates||jsonb_build_object('S',sv);resolved_fields:=array_append(resolved_fields,'S');continue;
   end if;
   if f='Z' then
    if sv<>'null' then$new$)
 ) as x(needle,replacement) loop
  if (length(definition)-length(replace(definition,change.needle,'')))/length(change.needle)<>1 then raise exception 'tracker_credit_policy_snapshot_drift: %',left(change.needle,70);end if;
  definition:=replace(definition,change.needle,change.replacement);
 end loop;
 execute definition;
 definition:=replace(pg_get_functiondef('public.ar_tracker_membership(uuid,text,uuid,jsonb)'::regprocedure),chr(13),'');
 if position('return jsonb_build_object(''observed'',true);' in definition)=0 then raise exception 'tracker_credit_policy_membership_drift';end if;
 execute replace(definition,'return jsonb_build_object(''observed'',true);','perform ar_private.tracker_retire_closed_warnings(p_region);return jsonb_build_object(''observed'',true);');
end $patch$;

-- Preview must share the same identity and field-authority decisions as import.
do $patch$
declare definition text;start_at integer;end_at integer;needle text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_preview(uuid,text,text,text,text,jsonb)'::regprocedure),chr(13),'');
 start_at:=strpos(definition,'select count(*),min(src.account_id),min(src.id) into match_count,a,i from ar_private.invoice_register_source src where');
 if start_at=0 then raise exception 'tracker_credit_preview_match_drift';end if;
 end_at:=strpos(substring(definition from start_at),';');
 needle:=substring(definition from start_at for end_at);
 definition:=replace(definition,needle,'select count(*),min(m.account_id),min(m.invoice_id) into match_count,a,i from ar_private.tracker_policy_match(r) m;');
 needle:=$old$wv:=coalesce(web_values->f,'null');$old$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_credit_preview_field_drift';end if;
 definition:=replace(definition,needle,needle||'if f=''T'' then continue;end if;');
 needle:=$old$when f in('S','T') then case when sv=wv then 'reference' else 'reference_difference' end$old$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_credit_preview_choice_drift';end if;
 definition:=replace(definition,needle,$new$when f='S' then case when sv='null' or sv=wv then 'reference' else 'eligible' end$new$);
 execute definition;
end $patch$;

-- T is intentionally independent; retire only reference warnings for this field.
update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where status='pending' and field='T';
revoke all on function ar_private.tracker_credit_guard(),ar_private.tracker_policy_match(jsonb),ar_private.tracker_adopt_credit(uuid,text,text,jsonb),ar_private.tracker_retire_closed_warnings(text) from public,anon,authenticated,service_role;
revoke all on function public.ar_tracker_credit_jobs(uuid,text,uuid),public.ar_tracker_credit_result(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ar_tracker_credit_jobs(uuid,text,uuid),public.ar_tracker_credit_result(uuid,text,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
