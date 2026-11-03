-- TSUN opening: exact catalog-qualified metadata/function changes only.
-- Hotel/account keys, RLS, grants, provider credentials and business rows stay scoped.
-- Append preserves an observed same-hotel/account Agent alias; SUN is read
-- compatibility only and new TSUN rows use the canonical TSUN property label.
-- Guest-native and empirical invoice policies require independent qualification.
begin;

-- ar_private.access_hotels(text[])
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.access_hotels(text[])'::regprocedure;
 if md5(body)<>'78c918b4633bc09bb2c40aa23c1e2b5c' then raise exception 'tsun_definition_drift:access_hotels';end if;
 definition:=replace(pg_get_functiondef('ar_private.access_hotels(text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1),
  ($needle$in('TLKL','WAKL','TLFO','TSAN')$needle$,$replacement$in('TLKL','WAKL','TLFO','TSAN','TSUN')$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:access_hotels';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.document_create_before_source_policy(uuid, uuid, text, text, text[], text, text, text, text)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.document_create_before_source_policy(uuid, uuid, text, text, text[], text, text, text, text)'::regprocedure;
 if md5(body)<>'186e50356c05fd227bddcfd9e6642c34' then raise exception 'tsun_definition_drift:document_create_before_source_policy';end if;
 definition:=replace(pg_get_functiondef('ar_private.document_create_before_source_policy(uuid, uuid, text, text, text[], text, text, text, text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:document_create_before_source_policy';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.financial_publish_without_mapping_coverage(uuid, uuid, text[])
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.financial_publish_without_mapping_coverage(uuid, uuid, text[])'::regprocedure;
 if md5(body)<>'05f2169f2388631444f64186375dc6e1' then raise exception 'tsun_definition_drift:financial_publish_without_mapping_coverage';end if;
 definition:=replace(pg_get_functiondef('ar_private.financial_publish_without_mapping_coverage(uuid, uuid, text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:financial_publish_without_mapping_coverage';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.gmail_hotel_mailbox(text)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.gmail_hotel_mailbox(text)'::regprocedure;
 if md5(body)<>'99928db0a81bd8e665c9e88dd48c7ca8' then raise exception 'tsun_definition_drift:gmail_hotel_mailbox';end if;
 definition:=replace(pg_get_functiondef('ar_private.gmail_hotel_mailbox(text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$in('TLKL','WAKL','TLFO','TSAN')$needle$,$replacement$in('TLKL','WAKL','TLFO','TSAN','TSUN')$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:gmail_hotel_mailbox';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.is_supported_hotel(text)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.is_supported_hotel(text)'::regprocedure;
 if md5(body)<>'02f9bd9602b414ca403e2a2503f2514c' then raise exception 'tsun_definition_drift:is_supported_hotel';end if;
 definition:=replace(pg_get_functiondef('ar_private.is_supported_hotel(text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:is_supported_hotel';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.publish_before_dashboard(uuid, integer)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.publish_before_dashboard(uuid, integer)'::regprocedure;
 if md5(body)<>'5c03151f1b1416ec84f18f2f21cd7b54' then raise exception 'tsun_definition_drift:publish_before_dashboard';end if;
 definition:=replace(pg_get_functiondef('ar_private.publish_before_dashboard(uuid, integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:publish_before_dashboard';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.publish_refresh_before_daily_capture(uuid, integer)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.publish_refresh_before_daily_capture(uuid, integer)'::regprocedure;
 if md5(body)<>'fd1c1ad510fd39d68ebaecf403cddaad' then raise exception 'tsun_definition_drift:publish_refresh_before_daily_capture';end if;
 definition:=replace(pg_get_functiondef('ar_private.publish_refresh_before_daily_capture(uuid, integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:publish_refresh_before_daily_capture';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.report_scope_hotels(text)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.report_scope_hotels(text)'::regprocedure;
 if md5(body)<>'fb832b36043018429ab5125d1821e4ae' then raise exception 'tsun_definition_drift:report_scope_hotels';end if;
 definition:=replace(pg_get_functiondef('ar_private.report_scope_hotels(text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:report_scope_hotels';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_bulk_settings_apply(uuid, jsonb, uuid)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_bulk_settings_apply(uuid, jsonb, uuid)'::regprocedure;
 if md5(body)<>'9e9529d6d9589cb70c6df2eb6c5b172b' then raise exception 'tsun_definition_drift:ar_bulk_settings_apply';end if;
 definition:=replace(pg_get_functiondef('public.ar_bulk_settings_apply(uuid, jsonb, uuid)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,2)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_bulk_settings_apply';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_claim_refresh(uuid)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_claim_refresh(uuid)'::regprocedure;
 if md5(body)<>'6bc907c7e9723b4cbe0d9ab2ed308b7c' then raise exception 'tsun_definition_drift:ar_claim_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_claim_refresh(uuid)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_claim_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_fail_refresh(uuid, text)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_fail_refresh(uuid, text)'::regprocedure;
 if md5(body)<>'60639e0a3a4a379cf8b10bd06d0b8a92' then raise exception 'tsun_definition_drift:ar_fail_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_fail_refresh(uuid, text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_fail_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_claim(uuid, uuid)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_claim(uuid, uuid)'::regprocedure;
 if md5(body)<>'06110d7a0e2aefde4b7982f5978c9c2a' then raise exception 'tsun_definition_drift:ar_financial_claim';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_claim(uuid, uuid)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_financial_claim';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_publish(uuid, uuid, text[])
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_publish(uuid, uuid, text[])'::regprocedure;
 if md5(body)<>'d8b062347155054e4f0f5e31f7ba97c9' then raise exception 'tsun_definition_drift:ar_financial_publish';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_publish(uuid, uuid, text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_financial_publish';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_request(uuid, uuid, jsonb, date, date, text, integer)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_request(uuid, uuid, jsonb, date, date, text, integer)'::regprocedure;
 if md5(body)<>'f36633c43c48d5f0a9841815aafaab23' then raise exception 'tsun_definition_drift:ar_financial_request';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_request(uuid, uuid, jsonb, date, date, text, integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_financial_request';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_request_refresh(text, text, text, integer)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_request_refresh(text, text, text, integer)'::regprocedure;
 if md5(body)<>'289fa5323693b61041d5f3c9a81c6061' then raise exception 'tsun_definition_drift:ar_request_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_request_refresh(text, text, text, integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_request_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_settings_save(uuid, text, text, integer, boolean, integer, jsonb, jsonb)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_settings_save(uuid, text, text, integer, boolean, integer, jsonb, jsonb)'::regprocedure;
 if md5(body)<>'ff0e75ca572721f6f929585d4fa1a51c' then raise exception 'tsun_definition_drift:ar_settings_save';end if;
 definition:=replace(pg_get_functiondef('public.ar_settings_save(uuid, text, text, integer, boolean, integer, jsonb, jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_settings_save';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_settings_save_v2(uuid, text, text, integer, boolean, integer, jsonb, jsonb, jsonb)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_settings_save_v2(uuid, text, text, integer, boolean, integer, jsonb, jsonb, jsonb)'::regprocedure;
 if md5(body)<>'69ffd63c82b8a0a269cb37bd68f04535' then raise exception 'tsun_definition_drift:ar_settings_save_v2';end if;
 definition:=replace(pg_get_functiondef('public.ar_settings_save_v2(uuid, text, text, integer, boolean, integer, jsonb, jsonb, jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']$needle$,$replacement$array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']$replacement$,2)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_settings_save_v2';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_tracker_append_prepare(uuid, text, uuid, uuid, jsonb, text, jsonb)
do $patch$
declare definition text;body text;r record;begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_tracker_append_prepare(uuid, text, uuid, uuid, jsonb, text, jsonb)'::regprocedure;
 if md5(body)<>'34b2ae5c6142437940abbfffe66c4a63' then raise exception 'tsun_definition_drift:ar_tracker_append_prepare';end if;
 definition:=replace(pg_get_functiondef('public.ar_tracker_append_prepare(uuid, text, uuid, uuid, jsonb, text, jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$when 'TSAN' then 'SAN' end$needle$,$replacement$when 'TSAN' then 'SAN' when 'TSUN' then 'TSUN' end$replacement$,1),
  ($needle$jsonb_build_array(r->>'property',btrim$needle$,$replacement$jsonb_build_array(case when candidate->>'hotel'='TSUN' and r->>'property'='SUN' then 'TSUN' else r->>'property' end,btrim$replacement$,1),
  ($needle$min(r->>'property'),min(btrim$needle$,$replacement$min(case when candidate->>'hotel'='TSUN' and r->>'property'='SUN' then 'TSUN' else r->>'property' end),min(btrim$replacement$,1),
  ($needle$length(property||'|'||agent||'|'))<>property||'|'||agent||'|'$needle$,$replacement$length((r->>'property')||'|'||agent||'|'))<>(r->>'property')||'|'||agent||'|'$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'tsun_patch_drift:ar_tracker_append_prepare';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- Setup states have no source publication/financial rows or Sent history. No refresh is requested.
insert into public.ar_refresh_state(hotel) values('TSUN') on conflict(hotel) do nothing;
insert into ar_private.dashboard_capture_state(hotel) values('TSUN') on conflict(hotel) do nothing;
commit;
