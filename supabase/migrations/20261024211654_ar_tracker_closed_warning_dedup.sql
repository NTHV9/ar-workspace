-- Do not manufacture another warning on every unchanged closed-row observation.
-- The same current evidence predicate gates recording, display and archival.
-- Reopened/unknown balances or changed actual identities still generate warnings.
do $patch$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('ar_private.tracker_ledger_conflict(text,text,text,text,jsonb,jsonb,jsonb,text)'::regprocedure),chr(13),'');
 needle:='begin'||chr(10)||' if p_mode=''v0'' then';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_closed_warning_dedup_drift';end if;
 execute replace(definition,needle,'begin'||chr(10)||' if p_mode in(''v0'',''v1'',''v2'',''v3'',''v4'') and ar_private.tracker_warning_closed(p_region,p_key) then return;end if;'||chr(10)||' if p_mode=''v0'' then');
end $patch$;
notify pgrst,'reload schema';
