-- Remittance commands only. These routines never modify OPERA or workflow rows.
create function public.ar_remittance_options(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 with historical as materialized (
  select distinct on (hotel,account_id) hotel,account_id,account_name,account_type,account_no
  from public.ar_remittances where owner=p_actor order by hotel,account_id,created_at desc,id
 ), accounts as (
  select a.hotel,a.id as account_id,a.name,a.type,a.account_no,a.verification_state in('verified','cleared') as verified
  from public.ar_accounts a
  union all
  select h.hotel,h.account_id,h.account_name,h.account_type,h.account_no,false
  from historical h where not exists(select 1 from public.ar_accounts a where a.hotel=h.hotel and a.id=h.account_id)
 ), types as (
  select type from public.ar_accounts
  union select account_type from public.ar_remittances where owner=p_actor
 )
 select jsonb_build_object(
  'accounts',coalesce((select jsonb_agg(jsonb_build_object('hotel',a.hotel,'accountId',a.account_id,'name',a.name,'type',a.type,'accountNo',a.account_no,'verified',a.verified) order by a.hotel,a.name,a.account_id) from accounts a),'[]'::jsonb),
  'accountTypes',coalesce((select jsonb_agg(type order by type) from types),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.ar_remittance_invoices(p_actor uuid,p_hotel text,p_account text,p_search text,p_offset integer,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_hotel is null or p_hotel not in('KAT','TSK') or p_account is null or length(p_account) not between 1 and 200
  or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]' or p_search is null or length(p_search)>200
  or p_search~E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 with matched as materialized (
  select i.*,ar_private.remittance_verified(i.verification_state,i.collection_role,i.open) as eligible,
   (i.verification_state in('verified','cleared') and (i.verification_state<>'cleared' or i.open=0)) as source_verified
  from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account
   and (p_search='' or strpos(lower(concat_ws(' ',i.id,i.invoice_no,i.folio_no,i.guest)),lower(p_search))>0)
 ), page as (
  select * from matched order by transaction_date desc,id offset p_offset limit p_limit
 )
 select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((
  select jsonb_agg(jsonb_build_object('invoiceId',i.id,'invoiceNo',coalesce(i.invoice_no,''),'folioNo',coalesce(i.folio_no,''),'guest',coalesce(i.guest,''),
   'transactionDate',i.transaction_date,'currentOpen',case when i.source_verified then ar_private.remittance_money(i.open) else null end,
   'verified',i.source_verified,'eligible',i.eligible,'reason',case
    when i.eligible then null
    when i.collection_role='child' then 'Compressed child: select its parent invoice.'
    when not i.source_verified then 'Saved OPERA source is unverified.'
    when i.open<0 then 'Negative balances cannot be linked as invoice debt.'
    else 'Invoice relationship requires verification.' end) order by i.transaction_date desc,i.id) from page i
 ),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.ar_remittance_save(p_actor uuid,p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 header public.ar_remittances; source_account public.ar_accounts; has_header boolean;
 command_id uuid; expected_revision integer; received date; total numeric(18,2); allocated numeric;
 scope_hotel text; scope_account text; reason text; command_result jsonb; field text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object'
  or jsonb_typeof(p_input->'commandId') is distinct from 'string'
  or (p_input->>'commandId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 command_id:=(p_input->>'commandId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 -- A recorded command wins even after later corrections, voids or source changes.
 command_result:=ar_private.remittance_command_result(p_actor,command_id,p_id,'save',p_input);
 if command_result is not null then return command_result;end if;

 if not(p_input ?& array['commandId','revision','confirmed','hotel','accountId','receivedDate','reference','sourceNote','notes','reportedAmount','lines','changeReason'])
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('commandId','revision','confirmed','hotel','accountId','receivedDate','reference','sourceNote','notes','reportedAmount','lines','changeReason'))
  or p_input->'confirmed' is distinct from 'true'::jsonb
  or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or (p_input->>'revision')!~'^(0|[1-9][0-9]{0,9})$' then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 if (p_input->>'revision')::bigint>2147483647 then return jsonb_build_object('error','remittance_invalid');end if;
 expected_revision:=(p_input->>'revision')::integer;
 foreach field in array array['hotel','accountId','receivedDate','reference','sourceNote','notes','changeReason'] loop
  if jsonb_typeof(p_input->field) is distinct from 'string' or (p_input->>field)~E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then
   return jsonb_build_object('error','remittance_invalid');
  end if;
 end loop;
 scope_hotel:=p_input->>'hotel';scope_account:=p_input->>'accountId';reason:=btrim(p_input->>'changeReason');
 if scope_hotel not in('KAT','TSK') or length(scope_account) not between 1 and 200 or scope_account<>btrim(scope_account)
  or scope_account~'[[:cntrl:]]' or scope_account~'^[[:space:]]|[[:space:]]$'
  or length(p_input->>'reference') not between 1 and 200 or (p_input->>'reference')~'^[[:space:]]*$'
  or length(p_input->>'sourceNote')>4000 or length(p_input->>'notes')>4000 then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 if length(p_input->>'changeReason')>1000 or (expected_revision>0 and reason~'^[[:space:]]*$') then
  return jsonb_build_object('error','remittance_change_reason_required');
 end if;
 if (p_input->>'receivedDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (p_input->>'receivedDate') like '0000-%' then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 received:=(p_input->>'receivedDate')::date;
 if to_char(received,'YYYY-MM-DD')<>p_input->>'receivedDate' then return jsonb_build_object('error','remittance_invalid');end if;
 if received>(clock_timestamp() at time zone 'Asia/Bangkok')::date then return jsonb_build_object('error','remittance_future_received_date');end if;
 if p_input->'reportedAmount'<>'null'::jsonb and (jsonb_typeof(p_input->'reportedAmount') is distinct from 'string'
  or (p_input->>'reportedAmount')!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$') then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 total:=(p_input->>'reportedAmount')::numeric(18,2);
 if jsonb_typeof(p_input->'lines') is distinct from 'array' then return jsonb_build_object('error','remittance_invalid');end if;
 if jsonb_array_length(p_input->'lines') not between 1 and 5000 then return jsonb_build_object('error','remittance_invalid');end if;
 if exists(select 1 from jsonb_array_elements(p_input->'lines') l where jsonb_typeof(l) is distinct from 'object') then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 if exists(
  select 1 from jsonb_array_elements(p_input->'lines') l
  where not(l ?& array['invoiceId','reportedAmount']) or exists(select 1 from jsonb_object_keys(l) k where k not in('invoiceId','reportedAmount'))
   or jsonb_typeof(l->'invoiceId') is distinct from 'string' or length(l->>'invoiceId') not between 1 and 200
   or l->>'invoiceId'<>btrim(l->>'invoiceId') or l->>'invoiceId'~'[[:cntrl:]]' or l->>'invoiceId'~'^[[:space:]]|[[:space:]]$'
   or (l->'reportedAmount'<>'null'::jsonb and (jsonb_typeof(l->'reportedAmount') is distinct from 'string'
    or l->>'reportedAmount'!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$'))
 ) or (select count(distinct l->>'invoiceId') from jsonb_array_elements(p_input->'lines') l)<>jsonb_array_length(p_input->'lines') then
  return jsonb_build_object('error','remittance_invalid');
 end if;
 select coalesce(sum((l->>'reportedAmount')::numeric),0) into allocated from jsonb_array_elements(p_input->'lines') l;
 if total is not null and allocated>total then return jsonb_build_object('error','remittance_allocation_overflow');end if;

 select * into header from public.ar_remittances where id=p_id for update;has_header:=found;
 if has_header then
  if header.owner<>p_actor then return jsonb_build_object('error','remittance_forbidden');end if;
  if header.revision<>expected_revision then return jsonb_build_object('error','remittance_revision_conflict');end if;
  if header.hotel<>scope_hotel or header.account_id<>scope_account then return jsonb_build_object('error','remittance_scope_immutable');end if;
  if header.state<>'active' then return jsonb_build_object('error','remittance_voided');end if;
  if exists(select 1 from ar_private.remittance_files where record_id=p_id and state='pending') then return jsonb_build_object('error','remittance_pending_upload');end if;
 else
  if expected_revision<>0 then return jsonb_build_object('error','remittance_missing');end if;
  select * into source_account from public.ar_accounts where hotel=scope_hotel and id=scope_account for share;
  if not found or source_account.verification_state not in('verified','cleared') then return jsonb_build_object('error','remittance_source_unverified');end if;
 end if;
 -- Protect newly linked source identities from concurrent refresh updates through commit.
 -- Existing links retain their captured identity even when their source later disappears.
 perform i.id from public.ar_invoices i
 join jsonb_array_elements(p_input->'lines') l on i.hotel=scope_hotel and i.account_id=scope_account and i.id=l->>'invoiceId'
 left join public.ar_remittance_lines old on old.record_id=p_id and old.invoice_id=i.id
 where old.invoice_id is null order by i.id for share of i;
 if exists(
  select 1 from jsonb_array_elements(p_input->'lines') l
  left join public.ar_remittance_lines old on old.record_id=p_id and old.invoice_id=l->>'invoiceId'
  left join public.ar_invoices i on i.hotel=scope_hotel and i.account_id=scope_account and i.id=l->>'invoiceId'
  where old.invoice_id is null and (i.id is null or not ar_private.remittance_verified(i.verification_state,i.collection_role,i.open))
 ) then return jsonb_build_object('error','remittance_invoice_invalid');end if;

 if has_header then
  update public.ar_remittances set revision=revision+1,received_date=received,reference=btrim(p_input->>'reference'),
   source_note=p_input->>'sourceNote',notes=p_input->>'notes',reported_amount=total,updated_at=clock_timestamp() where id=p_id;
 else
  insert into public.ar_remittances(id,owner,hotel,account_id,account_name,account_type,account_no,received_date,reference,source_note,notes,reported_amount)
  values(p_id,p_actor,scope_hotel,scope_account,source_account.name,source_account.type,source_account.account_no,received,btrim(p_input->>'reference'),p_input->>'sourceNote',p_input->>'notes',total);
 end if;
 -- Bulk joins and a hashed identity set keep 5,000-line changes linear, not per-line commands.
 with input_ids as materialized(select l->>'invoiceId' as invoice_id from jsonb_array_elements(p_input->'lines') l)
 delete from public.ar_remittance_lines where record_id=p_id and invoice_id not in(select invoice_id from input_ids);
 insert into public.ar_remittance_lines(record_id,invoice_id,position,snapshot,reported_amount)
 select p_id,l.value->>'invoiceId',l.ordinality::integer,
  coalesce(old.snapshot,jsonb_build_object('invoiceId',i.id,'hotel',scope_hotel,'accountId',scope_account,'invoiceNo',coalesce(i.invoice_no,''),'folioNo',coalesce(i.folio_no,''),'guest',coalesce(i.guest,''),'transactionDate',i.transaction_date)),
  (l.value->>'reportedAmount')::numeric(18,2)
 from jsonb_array_elements(p_input->'lines') with ordinality l(value,ordinality)
 left join public.ar_remittance_lines old on old.record_id=p_id and old.invoice_id=l.value->>'invoiceId'
 left join public.ar_invoices i on i.hotel=scope_hotel and i.account_id=scope_account and i.id=l.value->>'invoiceId'
 on conflict(record_id,invoice_id) do update set position=excluded.position,reported_amount=excluded.reported_amount;
 perform ar_private.remittance_history_add(p_actor,p_id,case when has_header then 'corrected' else 'created' end,reason);
 return ar_private.remittance_command_store(p_actor,command_id,p_id,'save',p_input);
exception
 when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or check_violation or not_null_violation then
  return jsonb_build_object('error','remittance_invalid');
 when unique_violation then return jsonb_build_object('error','remittance_revision_conflict');
 when others then return jsonb_build_object('error','remittance_unavailable');
end $$;

create function public.ar_remittance_set_status(p_actor uuid,p_id uuid,p_command uuid,p_revision integer,p_status text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare header public.ar_remittances;input jsonb;command_result jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or p_command is null then return jsonb_build_object('error','remittance_invalid');end if;
 input:=jsonb_build_object('revision',p_revision,'status',p_status,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 command_result:=ar_private.remittance_command_result(p_actor,p_command,p_id,'status',input);
 if command_result is not null then return command_result;end if;
 if p_revision is null or p_revision<1 or p_status is null or p_status not in('active','voided') then return jsonb_build_object('error','remittance_invalid');end if;
 if p_reason is null or length(p_reason) not between 1 and 1000 or p_reason~'^[[:space:]]*$' or p_reason~E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then
  return jsonb_build_object('error','remittance_change_reason_required');
 end if;
 select * into header from public.ar_remittances where id=p_id for update;
 if not found then return jsonb_build_object('error','remittance_missing');end if;
 if header.owner<>p_actor then return jsonb_build_object('error','remittance_forbidden');end if;
 if header.revision<>p_revision then return jsonb_build_object('error','remittance_revision_conflict');end if;
 if exists(select 1 from ar_private.remittance_files where record_id=p_id and state='pending') then return jsonb_build_object('error','remittance_pending_upload');end if;
 if header.state=p_status then return jsonb_build_object('error','remittance_invalid');end if;
 update public.ar_remittances set state=p_status,revision=revision+1,void_reason=case when p_status='voided' then btrim(p_reason) else null end,updated_at=clock_timestamp() where id=p_id;
 perform ar_private.remittance_history_add(p_actor,p_id,case when p_status='voided' then 'voided' else 'restored' end,btrim(p_reason));
 return ar_private.remittance_command_store(p_actor,p_command,p_id,'status',input);
exception
 when numeric_value_out_of_range or check_violation then return jsonb_build_object('error','remittance_invalid');
 when unique_violation then return jsonb_build_object('error','remittance_revision_conflict');
 when others then return jsonb_build_object('error','remittance_unavailable');
end $$;

create function public.ar_remittance_command_get(p_actor uuid,p_command uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare command ar_private.remittance_commands;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_command is null then return jsonb_build_object('error','remittance_invalid');end if;
 select * into command from ar_private.remittance_commands where owner=p_actor and command_id=p_command;
 if not found then return jsonb_build_object('complete',false);end if;
 return jsonb_build_object('complete',true,'recordId',command.record_id,'revision',command.result->'revision');
end $$;

revoke all on function public.ar_remittance_options(uuid),public.ar_remittance_invoices(uuid,text,text,text,integer,integer),public.ar_remittance_save(uuid,uuid,jsonb),public.ar_remittance_set_status(uuid,uuid,uuid,integer,text,text),public.ar_remittance_command_get(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_remittance_options(uuid),public.ar_remittance_invoices(uuid,text,text,text,integer,integer),public.ar_remittance_save(uuid,uuid,jsonb),public.ar_remittance_set_status(uuid,uuid,uuid,integer,text,text),public.ar_remittance_command_get(uuid,uuid) to service_role;
