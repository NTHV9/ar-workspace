-- 110: Complete inherited Account Type rules are usable immediately.
-- Provenance, explicit Account settings and all business rows remain unchanged.
-- Incomplete inherited rules retain Setup; preserve explicit legacy behavior.
do $patch$
declare definition text;needle text:=$n$when coalesce(w.account_setup_required,false) then 'setup'$n$;
begin
 definition:=replace(pg_get_functiondef('public.ar_dashboard_management(uuid,date,date,text,text,text)'::regprocedure),chr(13),'');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'usable_type_defaults_management_drift';end if;
 execute replace(definition,needle,$n$when coalesce(w.account_setup_required,false) and (w.billing_required is null or w.credit_term is null) then 'setup'$n$);
end $patch$;
-- Retain replaceable cache rows while preventing the old classification from
-- being served; account/invoice/settings/history data is not rewritten.
update ar_private.period_summary_generation set revision=revision+1 where singleton;
notify pgrst,'reload schema';
