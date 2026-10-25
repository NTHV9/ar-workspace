-- Both known quarantine reasons require the same exact owner-reviewed IDs and
-- fresh source/hash proof. An old other-account row is not the current ledger.
-- Preserve every existing authorization, history, source and command guard.
do $patch$
declare definition text;needle text:=$old$x->>'disposition'='quarantine_missing_row'$old$;
begin
 definition:=pg_get_functiondef('ar_private.tracker_append_restore_plan(uuid,text,uuid[])'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_append_restore_disposition_drift';end if;
 execute replace(definition,needle,$new$x->>'disposition' in('quarantine_missing_row','quarantine_identity_mismatch')$new$);
end $patch$;
