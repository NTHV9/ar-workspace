-- Resolve the report scope once per protected Dashboard read, then expose the
-- hotel equality to PostgreSQL's planner. The existing helper has SET search_path
-- and cannot inline, so invoking it per invoice hides index/selectivity facts.
-- Exact 103 definitions are required. No rows, identities, metrics or ACL change.
do $patch$
declare r record;body text;definition text;matches integer;
begin
 for r in select * from(values
  ('ar_private.dashboard_balance_read(uuid,date,text,text,text,text,text,integer,integer,integer,integer,boolean)','d751fd37f26d9dc6509766bbcaa25eb2',12),
  ('ar_private.dashboard_summary_balances(uuid,date,text,text,text,text,text,integer,integer)','1a6d363779ee5f67f3e46f9f7061626d',12),
  ('public.ar_dashboard_management(uuid,date,date,text,text,text)','03a6fb0d09f9f83f738b7db1f5c1b323',3)
 )f(signature,body_md5,expected) loop
  select replace(p.prosrc,chr(13),'') into body from pg_proc p where p.oid=r.signature::regprocedure;
  if md5(body) is distinct from r.body_md5 then raise exception 'dashboard_scope_definition_drift:%',r.signature;end if;
  select count(*) into matches from regexp_matches(body,'ar_private[.]hotel_in_report_scope\(([^,()]+),p_hotel\)','g');
  if matches<>r.expected or (length(body)-length(replace(body,'declare ','')))/length('declare ')<>1 then raise exception 'dashboard_scope_patch_drift:%',r.signature;end if;
  definition:=replace(pg_get_functiondef(r.signature::regprocedure),chr(13),'');
  definition:=replace(definition,'declare ','declare scope_hotels text[]:=ar_private.report_scope_hotels(p_hotel);');
  definition:=regexp_replace(definition,'ar_private[.]hotel_in_report_scope\(([^,()]+),p_hotel\)','(\1=any(scope_hotels))','g');
  execute definition;
 end loop;
end $patch$;
