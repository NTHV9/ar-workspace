-- Retired report-history maintenance must stay inert for older Worker versions.
-- Preserve the RPC response/auth/argument contract and every function privilege.
-- No history deletion, maintenance-state claim, or application-table write.
do $retire_history_maintenance$
declare target regprocedure:='public.ar_financial_log_prune(uuid,integer)'::regprocedure;
 definition text;body text;prior_acl aclitem[];prior_owner oid;prior_settings text[];prior_definer boolean;
 replacement text:=$body$
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'financial_log_limit_invalid';end if;
 return jsonb_build_object('status','succeeded','deleted',0,'moreEligible',false,'retentionMonths',1,'checkedAt',statement_timestamp());
end$body$;
begin
 select replace(pg_get_functiondef(oid),chr(13),''),replace(prosrc,chr(13),''),proacl,proowner,proconfig,prosecdef
 into strict definition,body,prior_acl,prior_owner,prior_settings,prior_definer from pg_proc where oid=target;
 if strpos(body,'delete from ar_private.financial_changes')=0
  or strpos(body,'financial_log_limit_invalid')=0 or strpos(body,'financial_forbidden')=0
  or (length(definition)-length(replace(definition,body,'')))/length(body)<>1 then raise exception 'retired_history_maintenance_definition_drift';end if;
 execute replace(definition,body,replacement);
 if exists(select 1 from pg_proc where oid=target and (proacl is distinct from prior_acl or proowner is distinct from prior_owner or proconfig is distinct from prior_settings or prosecdef is distinct from prior_definer)) then raise exception 'retired_history_maintenance_security_drift';end if;
end $retire_history_maintenance$;
