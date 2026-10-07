begin;
do $$
declare actor uuid;scope text:='SYNTH-TRACKER-LEDGER';rows jsonb;result jsonb;preview uuid;lease uuid:=gen_random_uuid();conflict uuid;expected_revision integer;before_sent bigint;history_count bigint;day date:=(now() at time zone 'Asia/Bangkok')::date-10;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic ledger','SYNTHETIC',300,0,3,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,id,id,id,day-20,100,100,case when id='HELD' then 'unknown' else 'verified' end,'standalone',false,now() from unnest(array['A','HELD','NEXT']) id;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_original_ledger_12345',0);
 select jsonb_agg(jsonb_build_object('rowKey','SYNTH-LEDGER-'||id,'hotel','KAT','accountNo',scope,'invoiceNo',id,'folio',id,'transactionDate',(day-20)::text,'locator',jsonb_build_object('row',n+2),'fields',jsonb_build_object(
 'R',case when id<>'NEXT' then day::text end,'S',case when id='A' then '60.0' else '30.0' end,'T',case when id<>'NEXT' then (day+30)::text end,
 'U',case when id<>'NEXT' then (day+1)::text end,'V',case when id<>'NEXT' then (day+1)::text end,'W',null,'X',case when id<>'NEXT' then (day+15)::text end,
 'Y',case when id<>'NEXT' then 'Synthetic unmapped status' end,'Z',null,'AA',null,'AB',case when id<>'NEXT' then 'Synthetic note' end,'AC',case when id<>'NEXT' then 'Source owner' end)) order by n) into rows from unnest(array['A','HELD','NEXT']) with ordinality x(id,n);
 select count(*) into before_sent from public.ar_sent_events;
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_original_ledger_12345','synthetic-ledger-v1',repeat('c',64),rows);
 if result->>'matchedRows'<>'2' or result->>'heldRows'<>'1' then raise exception 'ledger preview eligibility mismatch';end if;
 preview:=(result->>'previewId')::uuid;
 result:=public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('c',64),'synthetic-ledger-v1');
 if result->>'confirmed'<>'true' or result->>'imported'<>'1' then raise exception 'ledger atomic import incomplete';end if;
 if (select last_reminder_stage from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A')<>'Follow 2' then raise exception 'same-day stage priority changed';end if;
 if exists(select 1 from ar_private.tracker_history where account_id=scope and invoice_id<>'A') then raise exception 'held or following row inherited history';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id<>'A' and first_billing_date is not null) then raise exception 'held or following row inherited billing';end if;
 if exists(select 1 from ar_private.tracker_rows where region='phuket' and row_key='SYNTH-LEDGER-NEXT' and (baseline->>'R' is not null or baseline->>'AB' is not null or baseline->>'AC' is not null)) then raise exception 'baseline accumulator leaked across held row';end if;
 if public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('c',64),'synthetic-ledger-v1')->>'replayed'<>'true' then raise exception 'ledger confirmation replay changed';end if;
 perform public.ar_tracker_claim(actor,'phuket',lease,true);
 select id,revision into conflict,expected_revision from ar_private.tracker_conflicts where region='phuket' and row_key='SYNTH-LEDGER-A' and field='S' and status='pending';
 if conflict is null then raise exception 'credit reference hold missing';end if;
 perform public.ar_tracker_resolve(actor,'phuket',conflict,expected_revision,'keep_web');
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key='SYNTH-LEDGER-A' and field='S' and status='pending') then raise exception 'acknowledged reference reopened';end if;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value) values
 ('phuket','SYNTH-LEDGER-NEXT','AB','concurrent_or_unmapped_edit','null','null'),('phuket','SYNTH-LEDGER-NEXT','AC','concurrent_or_unmapped_edit','null','null');
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key='SYNTH-LEDGER-NEXT' and field in('AB','AC') and status='pending') then raise exception 'equal field set did not resolve';end if;
 rows:=jsonb_set(rows,'{0,fields,Y}','null');
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if exists(select 1 from ar_private.tracker_reported_status where hotel='KAT' and account_id=scope and invoice_id='A' and raw is not null) then raise exception 'reported status clear lost';end if;
 if (select last_reminder_stage from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A')<>'Follow 2' then raise exception 'status clear changed actual stage';end if;
 if not exists(select 1 from ar_private.tracker_history where account_id=scope and invoice_id='A' and field='Y' and source='sheet_reported_status' and after_value='null') then raise exception 'status clear provenance lost';end if;
 select count(*) into history_count from ar_private.tracker_history where account_id=scope;
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if (select count(*) from ar_private.tracker_history where account_id=scope)<>history_count then raise exception 'unchanged ledger replay duplicated history';end if;
 if (select count(*) from public.ar_sent_events)<>before_sent or (select credit_term from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A')<>30 then raise exception 'ledger changed Sent or credit authority';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_private' and p.proname like 'tracker_ledger_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))) then raise exception 'private ledger helper exposed';end if;
 if current_setting('plan_cache_mode')<>'auto' then raise exception 'tracker planning setting escaped function';end if;
 perform set_config('plan_cache_mode','force_generic_plan',true);
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if current_setting('plan_cache_mode')<>'force_generic_plan' then raise exception 'private helper changed caller planning mode';end if;
 perform set_config('plan_cache_mode','auto',true);
end $$;
rollback;