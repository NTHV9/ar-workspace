-- Owner-approved retirement of daily/historical report preparation.
-- No stored rows, tables, business dates, source balances or evidence are deleted.
-- The core atomic publisher and retained-zero wrapper remain authoritative.
do $retire$
declare r record;target regprocedure;definition text;body text;prior_acl aclitem[];prior_owner oid;prior_settings text[];prior_definer boolean;
begin
 for r in select * from(values
  ('ar_private.publish_before_retained_zero(uuid,integer)','daily_ar_captures',E'\nbegin\n perform ar_private.publish_refresh_before_daily_capture(p_run_id,p_expected_accounts);\nend'),
  ('public.ar_publish_refresh(uuid,integer)','dashboard_capture',E'\nbegin\n perform ar_private.publish_before_dashboard(p_run_id,p_expected_accounts);\nend'),
  ('ar_private.dashboard_capture(uuid,integer)','dashboard_daily_captures',E'\nbegin\n -- Retired supplemental history capture; current source publication is independent.\n return;\nend'),
  ('ar_private.dashboard_workflow_capture()','dashboard_daily_invoices',E'\nbegin\n -- Keep the trigger contract while retiring snapshot-only writes.\n return new;\nend'),
  ('ar_private.tracker_capture_current()','dashboard_daily_invoices',E'\nbegin\n -- Sheet facts continue through canonical authority/stage triggers.\n return new;\nend'),
  ('ar_private.tracker_capture_authority()','dashboard_daily_invoices',E'\nbegin\n -- Current workflow and Sheet dates are read directly, without a daily copy.\n return new;\nend')
 )x(signature,expected_reference,replacement) loop
  target:=r.signature::regprocedure;
  select replace(pg_get_functiondef(oid),chr(13),''),replace(prosrc,chr(13),''),proacl,proowner,proconfig,prosecdef
  into strict definition,body,prior_acl,prior_owner,prior_settings,prior_definer from pg_proc where oid=target;
  if strpos(body,r.expected_reference)=0 or (length(definition)-length(replace(definition,body,'')))/length(body)<>1 then raise exception 'retired_capture_definition_drift:%',target;end if;
  execute replace(definition,body,r.replacement);
  if exists(select 1 from pg_proc where oid=target and (proacl is distinct from prior_acl or proowner is distinct from prior_owner or proconfig is distinct from prior_settings or prosecdef is distinct from prior_definer)) then raise exception 'retired_capture_security_drift:%',target;end if;
 end loop;
end $retire$;

-- Current freshness already derives from successful publication plus current
-- Account/Invoice/workflow/settings timestamps. A retired daily copy must not
-- override it. Historical reader branches remain available for backed-up data.
do $current_freshness$
declare target regprocedure;definition text;line text;matches integer;prior_acl aclitem[];prior_owner oid;prior_settings text[];prior_definer boolean;
begin
 foreach target in array array[
  'public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)'::regprocedure,
  'ar_private.dashboard_balance_read(uuid,date,text,text,text,text,text,integer,integer,integer,integer,boolean)'::regprocedure,
  'ar_private.dashboard_summary_balances(uuid,date,text,text,text,text,text,integer,integer)'::regprocedure
 ] loop
  select replace(pg_get_functiondef(oid),chr(13),''),proacl,proowner,proconfig,prosecdef into strict definition,prior_acl,prior_owner,prior_settings,prior_definer from pg_proc where oid=target;
  select count(*),min(value) into matches,line from regexp_split_to_table(definition,chr(10))value where value like '  select greatest(capture_at,max(c.captured_at)) into capture_at from ar_private.dashboard_daily_captures c where c.day=today and %;';
  if matches<>1 then raise exception 'retired_capture_freshness_drift:%:%',target,matches;end if;
  execute replace(definition,line||chr(10),'');
  if exists(select 1 from pg_proc where oid=target and (proacl is distinct from prior_acl or proowner is distinct from prior_owner or proconfig is distinct from prior_settings or prosecdef is distinct from prior_definer)) then raise exception 'retired_capture_freshness_security_drift:%',target;end if;
 end loop;
end $current_freshness$;
