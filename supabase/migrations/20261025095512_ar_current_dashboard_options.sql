-- Current Dashboard filter choices are current Hotel + Account identities.
-- Immutable Sent metadata stays in its activity projection, never in this list.
do $patch$
declare
 definition text;matches integer;prior_acl aclitem[];prior_owner oid;prior_settings text[];prior_definer boolean;
 needle text:=$old$ if p_mode='options' then
  with options as (
   select hotel,id as account_id,name as account_name,type as account_type from public.ar_accounts
   union select hotel,account_id,account_name,account_type from ar_private.report_sent_invoices where owner=p_actor
  ), filtered as (select * from options where ar_private.hotel_in_report_scope(hotel,p_hotel))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(o)) from (select * from filtered order by hotel,account_name,account_id,account_type offset p_offset limit p_limit) o),'[]'::jsonb),'total',(select count(*) from filtered),'offset',p_offset,'limit',p_limit) into result;
 elsif p_mode='activity' then$old$;
 replacement text:=$new$ if p_mode='options' then
  with options as (
   select a.hotel,a.id as account_id,a.name as account_name,a.type as account_type
   from public.ar_accounts a
   where ar_private.hotel_in_report_scope(a.hotel,p_hotel)
    and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type)
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(o) order by o.hotel,o.account_id) from (select * from options order by hotel,account_id offset p_offset limit p_limit) o),'[]'::jsonb),'total',(select count(*) from options),'offset',p_offset,'limit',p_limit) into result;
 elsif p_mode='activity' then$new$;
begin
 select replace(pg_get_functiondef(oid),chr(13),''),proacl,proowner,proconfig,prosecdef
 into strict definition,prior_acl,prior_owner,prior_settings,prior_definer
 from pg_proc where oid='public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure;
 matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
 if matches<>1 then raise exception 'current_dashboard_options_definition_drift:%',matches;end if;
 execute replace(definition,needle,replacement);
 if exists(select 1 from pg_proc where oid='public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure
  and (proacl is distinct from prior_acl or proowner is distinct from prior_owner or proconfig is distinct from prior_settings or prosecdef is distinct from prior_definer)) then
  raise exception 'current_dashboard_options_security_drift';
 end if;
end $patch$;
