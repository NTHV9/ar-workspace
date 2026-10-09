-- 109: DRF is a monetary inventory only. No ledger, settings or history writes.
create function ar_private.balance_only_account(p_hotel text,p_account text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account and type='DRF')
$$;
revoke all on function ar_private.balance_only_account(text,text) from public,anon,authenticated,service_role;

-- Preserve the invoker/RLS projection and all non-DRF queue semantics.
do $patch$ declare definition text;begin
 definition:=pg_get_viewdef('public.ar_collection_rows'::regclass,true);
 if strpos(definition,'WHERE i.open > 0::numeric;')=0 then raise exception 'drf_collection_definition_drift';end if;
 execute 'create view ar_private.report_balance_inventory with(security_invoker=true) as '||definition;
 revoke all on ar_private.report_balance_inventory from public,anon,authenticated,service_role;
 execute 'create or replace view public.ar_collection_rows with(security_invoker=true) as '||replace(definition,'WHERE i.open > 0::numeric;','WHERE i.open > 0::numeric AND a.type IS DISTINCT FROM ''DRF'';');
end $patch$;

-- Reports retain their complete positive-balance inventory, independently of
-- queue eligibility. Historical activity remains untouched.
do $patch$ declare definition text;r record;begin
 definition:=replace(pg_get_functiondef('public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure),chr(13),'');
 for r in select * from(values
 ($n$from public.ar_collection_rows c join scoped_accounts$n$,$n$from ar_private.report_balance_inventory c join scoped_accounts$n$),
 ($n$coalesce(latest.kind,'No verified send') as latest_stage$n$,$n$case when c.account_type='DRF' then 'Balance only' else coalesce(latest.kind,'No verified send') end as latest_stage$n$),
 ($n$from matched group by latest_stage$n$,$n$from matched where account_type is distinct from 'DRF' group by latest_stage$n$),
 ($n$from matched where (workflow->>'billing_required')::boolean$n$,$n$from matched where account_type is distinct from 'DRF' and (workflow->>'billing_required')::boolean$n$),
 ($n$from matched where latest_terminal$n$,$n$from matched where account_type is distinct from 'DRF' and latest_terminal$n$)
 )p(needle,replacement) loop
 if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>1 then raise exception 'drf_reports_definition_drift:%',r.needle;end if;
 definition:=replace(definition,r.needle,r.replacement);
 end loop;execute definition;
end $patch$;

-- Guard fresh commands at their existing replay seams. Old files, receipts,
-- histories and reconciliation stay accessible; command payload checks remain.
do $patch$ declare definition text;r record;matches integer;begin
 for r in select * from(values
 ('public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text)',
 $n$perform set_config('ar.invoice_source',coalesce(chosen_source,'workspace'),true);$n$,
 $n$if not exists(select 1 from ar_private.document_commands where owner=p_owner and command_key=p_command_key) and ar_private.balance_only_account(p_hotel,p_account_id) then return jsonb_build_object('error','account_balance_only');end if;
 perform set_config('ar.invoice_source',coalesce(chosen_source,'workspace'),true);$n$),
 ('public.ar_email_open(uuid,uuid,integer)',
 $n$if j.discard_requested_at is not null$n$,
 $n$if ar_private.balance_only_account(j.hotel,j.account_id) and not exists(select 1 from public.ar_email_drafts where owner=p_actor and document_job_id=p_job_id and document_revision=p_document_revision) then return jsonb_build_object('error','account_balance_only');end if;
 if j.discard_requested_at is not null$n$),
 ('public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb)',
 $n$if p_draft is not null then select hotel into h$n$,
 $n$if not exists(select 1 from ar_private.mail_deliveries where draft_id=p_draft and revision=p_revision and owner=p_actor) and exists(select 1 from public.ar_email_drafts d where d.id=p_draft and d.owner=p_actor and ar_private.balance_only_account(d.hotel,d.account_id)) then return jsonb_build_object('error','account_balance_only');end if;
 if p_draft is not null then select hotel into h$n$),
 ('public.ar_gmail_attempt_claim(uuid,uuid,integer,text)',
 $n$begin$n$,
 $n$begin
 if not exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision) and exists(select 1 from public.ar_email_drafts d where d.id=p_draft and d.owner=p_owner and ar_private.balance_only_account(d.hotel,d.account_id)) then return jsonb_build_object('error','account_balance_only');end if;$n$),
 ('public.ar_external_billing_preview(uuid,jsonb)',
 $n$if action<>'record' then$n$,
 $n$if ar_private.balance_only_account(h,a) then raise exception 'billing_balance_only';end if;
 if action<>'record' then$n$)
 )p(signature,needle,replacement) loop
 definition:=replace(pg_get_functiondef(r.signature::regprocedure),chr(13),'');
 matches:=(length(definition)-length(replace(definition,r.needle,'')))/length(r.needle);
 if matches<>1 then raise exception 'drf_business_definition_drift:%',r.signature;end if;
 execute replace(definition,r.needle,r.replacement);
 end loop;
end $patch$;

-- Save already calls preview after its durable replay/conflict check. A worker
-- preflight gives an intelligible error before provider access or file reads.
create function public.ar_email_business_preflight(p_actor uuid,p_draft uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.ar_email_drafts;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 select * into d from public.ar_email_drafts where id=p_draft and owner=p_actor;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if ar_private.balance_only_account(d.hotel,d.account_id) then return jsonb_build_object('error','account_balance_only');end if;
 return jsonb_build_object('allowed',true);
end$$;
revoke all on function public.ar_email_business_preflight(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_email_business_preflight(uuid,uuid) to service_role;

-- Preserve net balances, age inventory, financial completeness and member proofs.
-- Remove DRF only from operational cohorts and their unknown-due denominator.
do $patch$ declare definition text;fn regprocedure;r record;matches integer;patched integer:=0;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','ar_private') and p.prokind='f' and p.prosrc like '%ar_private.dashboard_metric_membership(s.open,%' loop
 definition:=replace(pg_get_functiondef(fn),chr(13),'');
 for r in select * from(values
 ($n$ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of) as memberships$n$,
 $n$case when s.account_type='DRF' then array(select m from unnest(ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of))m where m in('open','over60')) else ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of) end as memberships$n$),
 ($n$verified and open>0 and (billing_required is null$n$,$n$verified and account_type is distinct from 'DRF' and open>0 and (billing_required is null$n$),
 ($n$where s.latest_stage is not null and not exists$n$,$n$where s.account_type is distinct from 'DRF' and s.latest_stage is not null and not exists$n$),
 ($n$s.latest_stage=k.key and s.verified and s.open>0$n$,$n$s.latest_stage=k.key and s.account_type is distinct from 'DRF' and s.verified and s.open>0$n$),
 ($n$latest_stage=p_stage and verified and open>0$n$,$n$latest_stage=p_stage and account_type is distinct from 'DRF' and verified and open>0$n$)
 )p(needle,replacement) loop
 matches:=(length(definition)-length(replace(definition,r.needle,'')))/length(r.needle);
 if matches<>1 then raise exception 'drf_dashboard_definition_drift:%:%',fn,r.needle;end if;
 definition:=replace(definition,r.needle,r.replacement);
 end loop;execute definition;patched:=patched+1;
 end loop;
 if patched<>3 then raise exception 'drf_dashboard_function_count:%',patched;end if;
end $patch$;

do $patch$ declare definition text;r record;matches integer;begin
 definition:=replace(pg_get_functiondef('public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)'::regprocedure),chr(13),'');
 for r in select * from(values
 ($n$p_status in('unbilled','billed','not_required','setup','credit')$n$,$n$p_status in('unbilled','billed','not_required','setup','credit','balance_only')$n$),
 ($n$p_status in('not_due','due_today','past_due','awaiting_billing','unknown','credit')$n$,$n$p_status in('not_due','due_today','past_due','awaiting_billing','unknown','credit','balance_only')$n$),
 ($n$p_status in('none','unknown','credit')$n$,$n$p_status in('none','unknown','credit','balance_only')$n$),
 ($n$case when s.open<0 then 'credit'$n$,$n$case when s.account_type='DRF' then 'balance_only' when s.open<0 then 'credit'$n$),
 ($n$case when s.open<0 then 'Credit'$n$,$n$case when s.account_type='DRF' then 'Balance only' when s.open<0 then 'Credit'$n$),
 ($n$'dueDate',case when s.open<0 then null$n$,$n$'dueDate',case when s.account_type='DRF' or s.open<0 then null$n$),
 ($n$('billing','credit','Credit')$n$,$n$('billing','balance_only','Balance only'),('billing','credit','Credit')$n$),
 ($n$('due','credit','Credit')$n$,$n$('due','balance_only','Balance only'),('due','credit','Credit')$n$)
 )p(needle,replacement) loop
 matches:=(length(definition)-length(replace(definition,r.needle,'')))/length(r.needle);
 if matches<>(case when r.needle=$n$case when s.open<0 then 'credit'$n$ then 3 else 1 end) then raise exception 'drf_aging_definition_drift:%',r.needle;end if;
 definition:=replace(definition,r.needle,r.replacement);
 end loop;execute definition;
end $patch$;
-- Management keeps issued invoice/credit inventory and all monetary age bands.
-- DRF contributes no billed/setup/not-required/unbilled cohort or counters.
do $patch$ declare definition text;r record;begin
 definition:=replace(pg_get_functiondef('public.ar_dashboard_management(uuid,date,date,text,text,text)'::regprocedure),chr(13),'');
 for r in select * from(values
 ($n$s.age between 61 and 90 and s.billing_required$n$,$n$s.age between 61 and 90 and s.account_type is distinct from 'DRF' and s.billing_required$n$),
 ($n$filter(where billing_required and (first_billing_date$n$,$n$filter(where account_type is distinct from 'DRF' and billing_required and (first_billing_date$n$),
 ($n$case when i.original<0 then 'credit'$n$,$n$case when i.original<0 then 'credit' when a.type='DRF' then 'balance_only'$n$)
 )p(needle,replacement) loop
 if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>(case when r.needle=$n$filter(where billing_required and (first_billing_date$n$ then 2 else 1 end) then raise exception 'drf_management_definition_drift:%',r.needle;end if;
 definition:=replace(definition,r.needle,r.replacement);
 end loop;execute definition;
end $patch$;
-- Existing cache entries are stale under the new business classification.
-- Keep cached rows; their old generation can no longer be served.
update ar_private.period_summary_generation set revision=revision+1 where singleton;
notify pgrst,'reload schema';
