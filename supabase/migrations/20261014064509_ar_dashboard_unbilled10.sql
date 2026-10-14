do $patch$
declare definition text;needle text;age_value integer;keys text[];
begin
 definition:=pg_get_functiondef('ar_private.dashboard_metric_membership(numeric,boolean,boolean,integer,date,date,integer,date)'::regprocedure);
 needle:='p_age>=31';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'unbilled10_membership_drift';end if;
 execute replace(definition,needle,'p_age>=10');
 definition:=pg_get_functiondef('public.ar_dashboard_management(uuid,date,date,text,text,text)'::regprocedure);
 needle:='s.age>=31';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'unbilled10_matrix_drift';end if;
 execute replace(definition,needle,'s.age>=10');
 foreach age_value in array array[9,10,11,30,31,60,61] loop
 keys:=ar_private.dashboard_metric_membership(100,true,true,30,null,current_date,age_value,current_date);
 if ('over60_unbilled'=any(keys)) is distinct from (age_value>=10) or ('over60'=any(keys)) is distinct from (age_value>60) then raise exception 'unbilled10_boundary_failed';end if;
 end loop;
 if 'over60_unbilled'=any(ar_private.dashboard_metric_membership(100,true,true,30,current_date,current_date,10,current_date)) or 'over60_unbilled'=any(ar_private.dashboard_metric_membership(100,true,false,30,null,current_date,10,current_date)) then raise exception 'unbilled10_billing_fence_failed';end if;
end $patch$;
-- Keep established API aliases for cached/older clients; their membership now means age >=10.
update ar_private.period_summary_generation set revision=revision+1 where singleton;
notify pgrst,'reload schema';
