-- First actual billing cannot move after a genuinely confirmed billing day.
-- Earlier external first-billing dates and reviewed acknowledgments stay valid.
do $$declare definition text;needle text;begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),E'\r','');
 needle:=$needle$   elsif (base is null and wv='null' or base=wv) and sv<>'null' then$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_billing_date_import_guard_drift';end if;
 definition:=replace(definition,needle,$replacement$   elsif (case when f='R' and sv<>'null' and floor_day is not null then (sv#>>'{}')::date>floor_day else false end) then needs_review:=true;
   elsif (base is null and wv='null' or base=wv) and sv<>'null' then$replacement$);
 execute definition;
end $$;
