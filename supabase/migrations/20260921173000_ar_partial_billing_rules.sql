-- Assign known billing facts immediately; only freeze a rule set when both
-- requirement and credit term are known. Never infer a zero-day term.
create function ar_private.apply_unassigned_billing_rules(p_hotel text,p_account_id text,p_invoice_id text default null)
returns void language sql security definer set search_path='' as $$
 update public.ar_invoice_workflow w
 set billing_required=s.billing_required,credit_term=s.credit_term,
 settings_revision=case when s.billing_required is not null and s.credit_term is not null then s.revision end,
 revision=w.revision+1,updated_at=now()
 from public.ar_account_settings s,public.ar_invoices i
 where s.hotel=p_hotel and s.account_id=p_account_id
 and i.hotel=s.hotel and i.account_id=s.account_id and i.collection_selectable
 and w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 and (p_invoice_id is null or w.invoice_id=p_invoice_id) and w.settings_revision is null
 and (w.billing_required,w.credit_term,w.settings_revision) is distinct from
 (s.billing_required,s.credit_term,case when s.billing_required is not null and s.credit_term is not null then s.revision end);
$$;
revoke all on function ar_private.apply_unassigned_billing_rules(text,text,text) from public,anon,authenticated,service_role;

create or replace function ar_private.sync_invoice_workflow() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ar_invoice_workflow(hotel,account_id,invoice_id,base_date) values(new.hotel,new.account_id,new.id,new.transaction_date) on conflict do nothing;
 if new.collection_selectable then perform ar_private.apply_unassigned_billing_rules(new.hotel,new.account_id,new.id);end if;
 return new;
end $$;

-- Retain the latest regional identity, conflict and delivery guards in the
-- existing writer; replace only its all-or-nothing assignment block.
do $patch$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)'::regprocedure),E'\r','');
 needle:=$old$if p_billing_required is not null and p_credit_term is not null then
  update public.ar_invoice_workflow w set billing_required=p_billing_required,credit_term=p_credit_term,settings_revision=p_revision+1
  from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account_id and i.collection_selectable and w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id and w.settings_revision is null;
 end if;$old$;
 -- SQL Editor on Windows may submit CRLF inside dollar-quoted strings.
 needle:=replace(needle,E'\r','');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'partial_billing_rules_writer_drift';end if;
 execute replace(definition,needle,' perform ar_private.apply_unassigned_billing_rules(p_hotel,p_account_id);');
end $patch$;

-- Repair only unassigned workflows from each account's saved settings.
-- Established terms, dates, reminders and financial amounts stay untouched.
do $$
declare s record;
begin
 for s in select distinct a.hotel,a.account_id from public.ar_account_settings a
 join public.ar_invoice_workflow w on w.hotel=a.hotel and w.account_id=a.account_id
 where w.settings_revision is null loop
  perform ar_private.apply_unassigned_billing_rules(s.hotel,s.account_id);
 end loop;
end $$;
