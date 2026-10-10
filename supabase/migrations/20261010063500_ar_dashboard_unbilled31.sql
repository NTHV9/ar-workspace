-- 111: Unbilled invoice attention starts at raw OPERA invoice age 31 days.
-- Keep the established RPC/filter key and preserve general 61+ aging inventory.
do $patch$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('ar_private.dashboard_metric_membership(numeric,boolean,boolean,integer,date,date,integer,date)'::regprocedure),chr(13),'');
 needle:=$n$case when p_age>60 and p_billing and (p_first is null or p_first>p_day) then 'over60_unbilled'$n$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'dashboard_unbilled31_membership_drift';end if;
 execute replace(definition,needle,$n$case when p_age>=31 and p_billing and (p_first is null or p_first>p_day) then 'over60_unbilled'$n$);

 definition:=replace(pg_get_functiondef('public.ar_dashboard_management(uuid,date,date,text,text,text)'::regprocedure),chr(13),'');
 needle:=$n$as unbilled61,$n$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'dashboard_unbilled31_hotel_drift';end if;
 definition:=replace(definition,needle,$n$as unbilled61,
   count(s.invoice_id) filter(where s.verified and s.open>0 and s.age>=31 and s.account_type is distinct from 'DRF' and s.billing_required and (s.first_billing_date is null or s.first_billing_date>p_to)) as unbilled31,$n$);
 needle:=$n$'unbilled61',case when (select ages from known) then unbilled61 end,$n$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'dashboard_unbilled31_output_drift';end if;
 execute replace(definition,needle,needle||$n$'unbilled31',case when (select ages from known) then unbilled31 end,$n$);
end $patch$;
-- Retain replaceable cache rows; their prior generation cannot be served.
update ar_private.period_summary_generation set revision=revision+1 where singleton;
notify pgrst,'reload schema';
