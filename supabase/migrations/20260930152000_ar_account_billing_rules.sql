-- Explicit Account Billing requirement or Credit term changes govern existing invoices.
-- Preserve actual billing/reminder history and OPERA amounts.
create function ar_private.apply_account_billing_rules(p_actor uuid,p_hotel text,p_account_id text)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.ar_account_settings;n integer;
begin
 if p_actor is null then raise exception 'billing_rules_actor_missing';end if;
 select * into strict s from public.ar_account_settings where hotel=p_hotel and account_id=p_account_id for update;
 with changed as (
  update public.ar_invoice_workflow w
  set billing_required=s.billing_required,credit_term=s.credit_term,
  settings_revision=case when s.billing_required is not null and s.credit_term is not null then s.revision end,
  rules_manually_set=false,revision=w.revision+1,updated_at=now()
  where w.hotel=p_hotel and w.account_id=p_account_id and ((w.billing_required,w.credit_term) is distinct from (s.billing_required,s.credit_term) or w.rules_manually_set)
  returning w.*
 )
 insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details)
 select c.hotel,c.account_id,c.invoice_id,c.revision,p_actor,
 to_jsonb(c)||jsonb_build_object('change_source','account_billing_rules','account_settings_revision',s.revision)
 from changed c;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function ar_private.apply_account_billing_rules(uuid,text,text) from public,anon,authenticated,service_role;

-- Patch only the assignment policy inside the guarded writer. Its outer v2 wrapper
-- retains regional authorization, pending-delivery checks, locks and no-op handling.
do $patch$
declare definition text;r record;
begin
 definition:=replace(pg_get_functiondef('public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)'::regprocedure),E'\r','');
 for r in select * from (values
  ('declare existing_revision integer;result jsonb;',
   'declare existing_revision integer;existing_requirement boolean;existing_term integer;result jsonb;'),
  ('select revision into existing_revision from public.ar_account_settings where hotel=p_hotel and account_id=p_account_id for update;',
   'select revision,billing_required,credit_term into existing_revision,existing_requirement,existing_term from public.ar_account_settings where hotel=p_hotel and account_id=p_account_id for update;'),
  ('perform ar_private.apply_unassigned_billing_rules(p_hotel,p_account_id);',
   'perform ar_private.apply_unassigned_billing_rules(p_hotel,p_account_id); if (existing_requirement,existing_term) is distinct from (p_billing_required,p_credit_term) then perform ar_private.apply_account_billing_rules(p_actor,p_hotel,p_account_id);end if;')
 ) as changes(needle,replacement) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>1 then raise exception 'account_billing_rules_writer_drift';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;
notify pgrst,'reload schema';
