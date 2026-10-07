-- LOCAL synthetic importer provenance; no historical timestamp inference.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-PROVENANCE-'||gen_random_uuid();lease uuid:=gen_random_uuid();rows jsonb;r jsonb;preview uuid;result jsonb;item jsonb;input jsonb;cmd uuid:=gen_random_uuid();history_before bigint;mapping_before bigint;conflict uuid;conflict_revision integer;automatic_input jsonb;manual_input jsonb;counter integer;first_page jsonb;next_page jsonb;role_name text;denied boolean;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'0002','LOCAL provenance','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','00001','F1','2026-09-01',100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 rows:=jsonb_build_array(jsonb_build_object('rowKey',scope,'hotel','KAT','accountNo','0002','invoiceNo','00001','folio','F1','transactionDate','2026-09-01','locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null,'X','2026-09-20','Y','LOCAL raw status','Z',null,'AA',null,'AB','LOCAL imported note','AC','LOCAL responsible')));
 perform public.ar_tracker_connect(actor,'phuket','LOCAL_provenance_tracker_12345',0);r:=public.ar_tracker_preview(actor,'phuket','LOCAL_provenance_tracker_12345','v1',repeat('a',64),rows);preview:=(r->>'previewId')::uuid;
 perform public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('a',64),'v1');perform public.ar_tracker_claim(actor,'phuket',lease,true);
 result:=public.ar_invoice_register_history(actor,'KAT',scope,'A',0);
 if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'source'='sheet_import' and h->>'actor' like 'Sheet record · editor unavailable; imported by %' and h->'after_value'->>'note'='LOCAL imported note') then raise exception 'sheet import misattributed as manual Register history';end if;
 if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'source'='sheet_reported_status') then raise exception 'raw Y provenance lost';end if;
 -- A normal nearby manual command remains manual, with its own exact command.
 r:=public.ar_invoice_register_get(actor,'KAT',scope,'A');input:=jsonb_build_object('commandId',cmd,'workflowRevision',r->'workflow_revision','exceptionRevision',r->'exception_revision','revision',r->'tracking_revision','values',ar_private.invoice_register_values(r)||jsonb_build_object('note','LOCAL manual note'));
 result:=public.ar_invoice_register_save(actor,'KAT',scope,'A',input);if result?'error' then raise exception 'manual fixture failed: %',result->>'error';end if;
 manual_input:=input;
 result:=public.ar_invoice_register_history(actor,'KAT',scope,'A',0);if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'source'='register' and h->>'actor' not like 'Sheet record%' and h->'after_value'->>'note'='LOCAL manual note') then raise exception 'manual edit mislabeled';end if;
 -- Reviewed source import is mapped separately, never by adjacent timestamp.
 rows:=jsonb_set(rows,'{0,fields,AB}','"LOCAL reviewed note"');perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 select id,revision into strict conflict,conflict_revision from ar_private.tracker_conflicts where region='phuket' and row_key=scope and field='AB' and status='pending';result:=public.ar_tracker_resolve(actor,'phuket',conflict,conflict_revision,'accept_sheet');if result?'error' then raise exception 'reviewed fixture failed';end if;
 result:=public.ar_invoice_register_history(actor,'KAT',scope,'A',0);if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'source'='sheet_import' and h->>'actor' like 'Sheet record · editor unavailable; imported by %' and h->'after_value'->>'note'='LOCAL reviewed note') then raise exception 'reviewed Sheet import misattributed';end if;
 -- No command existed in old history: label uncertainty, without guessing its origin.
 insert into ar_private.invoice_register_history(actor,hotel,account_id,invoice_id,before_value,after_value) values(actor,'KAT',scope,'A','{}','{"note":"LOCAL unclassified old row"}');result:=public.ar_invoice_register_history(actor,'KAT',scope,'A',0);
 if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'source'='legacy_unclassified' and h->>'actor' like 'Source not recorded · recorded by %' and h->'after_value'->>'note'='LOCAL unclassified old row') then raise exception 'unclassified history asserted as manual';end if;
 -- Replay is linked to the same exact command/history row, even with later
 -- manual commands in the same transaction and therefore identical timestamps.
 select c.input->'input' into strict automatic_input from ar_private.tracker_register_history_source provenance join ar_private.invoice_register_commands c on c.command_id=provenance.command_id where provenance.account_id=scope and provenance.import_kind='automatic';
 select count(*) into history_before from ar_private.invoice_register_history where account_id=scope;select count(*) into mapping_before from ar_private.tracker_register_history_source where account_id=scope;
 result:=ar_private.tracker_register_save(actor,'phuket',scope,'automatic','KAT',scope,'A',automatic_input);if result->>'replayed' is distinct from 'true' then raise exception 'exact mapped replay not idempotent';end if;
 if (select count(*) from ar_private.invoice_register_history where account_id=scope)<>history_before or (select count(*) from ar_private.tracker_register_history_source where account_id=scope)<>mapping_before then raise exception 'mapped replay duplicated history';end if;
 denied:=false;begin perform ar_private.tracker_register_save(actor,'phuket',scope,'automatic','KAT',scope,'A',manual_input);exception when others then if sqlerrm='tracker_provenance_untracked_replay' then denied:=true;else raise;end if;end;if not denied then raise exception 'manual command relabeled as Sheet';end if;
 -- Failed revision and unauthorized canonical context create no mapping.
 r:=public.ar_invoice_register_get(actor,'KAT',scope,'A');input:=jsonb_build_object('commandId',gen_random_uuid(),'workflowRevision',-1,'exceptionRevision',r->'exception_revision','revision',r->'tracking_revision','values',ar_private.invoice_register_values(r));
 result:=ar_private.tracker_register_save(actor,'phuket',scope,'automatic','KAT',scope,'A',input);if result->>'error' is distinct from 'register_revision_conflict' then raise exception 'failed revision bypassed';end if;
 denied:=false;begin perform ar_private.tracker_register_save(actor,'phuket',scope,'automatic','TSK',scope,'A',input);exception when others then if sqlerrm='tracker_provenance_scope' then denied:=true;else raise;end if;end;if not denied then raise exception 'wrong canonical scope accepted';end if;
 denied:=false;begin perform ar_private.tracker_register_save(gen_random_uuid(),'phuket',scope,'automatic','KAT',scope,'A',input);exception when others then denied:=true;end;if not denied then raise exception 'unknown actor accepted';end if;
 if (select count(*) from ar_private.invoice_register_history where account_id=scope)<>history_before or (select count(*) from ar_private.tracker_register_history_source where account_id=scope)<>mapping_before then raise exception 'failed command created provenance';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,'ar_private.tracker_register_save(uuid,text,text,text,text,text,text,jsonb)','EXECUTE') or has_function_privilege(role_name,'ar_private.tracker_ledger_recover_identity(text,text)','EXECUTE') or has_table_privilege(role_name,'ar_private.tracker_register_history_source','SELECT,INSERT,UPDATE,DELETE') then raise exception 'private provenance exposed';end if;
 end loop;
 -- The union/pager keeps all before/after rows and explicit raw-Y history.
 for counter in 1..21 loop
  r:=public.ar_invoice_register_get(actor,'KAT',scope,'A');input:=jsonb_build_object('commandId',gen_random_uuid(),'workflowRevision',r->'workflow_revision','exceptionRevision',r->'exception_revision','revision',r->'tracking_revision','values',ar_private.invoice_register_values(r)||jsonb_build_object('note','LOCAL manual pager '||counter));
  result:=public.ar_invoice_register_save(actor,'KAT',scope,'A',input);if result?'error' then raise exception 'manual pager fixture failed';end if;
 end loop;
 first_page:=public.ar_invoice_register_history(actor,'KAT',scope,'A',0);next_page:=public.ar_invoice_register_history(actor,'KAT',scope,'A',20);
 if first_page->'total' is distinct from next_page->'total' or jsonb_array_length(first_page->'rows')<>20 or jsonb_array_length(first_page->'rows')+jsonb_array_length(next_page->'rows')<>(first_page->>'total')::integer then raise exception 'history pager count drift';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'rows') a join jsonb_array_elements(next_page->'rows') b on a->>'id'=b->>'id') then raise exception 'history pager duplicate';end if;
 if (select count(*) from ar_private.tracker_register_history_source where account_id=scope)<>2 then raise exception 'manual interleaving gained Sheet provenance';end if;
end $$;
rollback;
