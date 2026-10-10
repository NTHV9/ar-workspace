-- 112: Read-only drill for verified negative invoice inventory. Native account
-- Aging credits do not create invoice identities. All other memberships remain.
do $patch$
declare definition text;fn text;r record;
begin
 foreach fn in array array[
 'public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)',
 'ar_private.dashboard_balance_read(uuid,date,text,text,text,text,text,integer,integer,integer,integer,boolean)',
 'ar_private.dashboard_summary_balances(uuid,date,text,text,text,text,text,integer,integer)'] loop
 definition:=replace(pg_get_functiondef(fn::regprocedure),chr(13),'');
 for r in select * from(values
 ($n$p_metric not in('open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled')$n$,
  $n$p_metric not in('open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled','credit')$n$),
 ($n$with source as materialized($n$,
  $n$if p_metric='credit' and not credit_coverage then complete:=false;reason:='credit_snapshot_unavailable';end if;
 with source as materialized($n$),
 ($n$(p_metric is null or p_metric=any(memberships))$n$,
  $n$(p_metric is null or p_metric='credit' and credit_coverage and verified and open<0 or p_metric<>'credit' and p_metric=any(memberships))$n$)
 )p(needle,replacement) loop
 if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>1 then raise exception 'dashboard_credit_drill_definition_drift:%:%',fn,r.needle;end if;
 definition:=replace(definition,r.needle,r.replacement);
 end loop;execute definition;
 end loop;
end $patch$;
update ar_private.period_summary_generation set revision=revision+1 where singleton;
notify pgrst,'reload schema';
