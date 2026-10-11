-- Migration 114: preserve the reviewed revision when a pending conflict's
-- existing writer would assign exactly the same values. Genuine changes still
-- advance revision and remain subject to the resolver's revision fence.
do $migration$
declare target regprocedure:='ar_private.tracker_ledger_conflict(text,text,text,text,jsonb,jsonb,jsonb,text)'::regprocedure;
 definition text;patch record;
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid=target)<>'8b1605c434f2b61ae108f6accac03b1e' then raise exception 'tracker conflict writer definition drift';end if;
 definition:=replace(pg_get_functiondef(target),chr(13),'');
 for patch in select * from(values
 ($old$do update set reason=excluded.reason,revision=ar_private.tracker_conflicts.revision+1;$old$,
  $new$do update set reason=excluded.reason,revision=ar_private.tracker_conflicts.revision+1
    where ar_private.tracker_conflicts.reason is distinct from excluded.reason;$new$),
 ($old$do update set reason=excluded.reason,sheet_value=excluded.sheet_value,revision=ar_private.tracker_conflicts.revision+1;$old$,
  $new$do update set reason=excluded.reason,sheet_value=excluded.sheet_value,revision=ar_private.tracker_conflicts.revision+1
    where row(ar_private.tracker_conflicts.reason,ar_private.tracker_conflicts.sheet_value) is distinct from row(excluded.reason,excluded.sheet_value);$new$),
 ($old$do update set sheet_value=excluded.sheet_value,web_value=excluded.web_value,baseline=excluded.baseline,revision=ar_private.tracker_conflicts.revision+1;$old$,
  $new$do update set sheet_value=excluded.sheet_value,web_value=excluded.web_value,baseline=excluded.baseline,revision=ar_private.tracker_conflicts.revision+1
    where row(ar_private.tracker_conflicts.sheet_value,ar_private.tracker_conflicts.web_value,ar_private.tracker_conflicts.baseline) is distinct from row(excluded.sheet_value,excluded.web_value,excluded.baseline);$new$)
 )v(needle,replacement) loop
  if (length(definition)-length(replace(definition,patch.needle,'')))/length(patch.needle)<>1 then raise exception 'tracker conflict patch drift';end if;
  definition:=replace(definition,patch.needle,patch.replacement);
 end loop;
 execute definition;
end $migration$;
