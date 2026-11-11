begin;
do $$
#variable_conflict use_variable
declare actor uuid;lease uuid:=gen_random_uuid();scope text:='SYNTH-TRANSFER-'||gen_random_uuid();h text;reg text;prop text;r jsonb;j jsonb;job uuid;oldkey text;newkey text;d date:=(now() at time zone 'Asia/Bangkok')::date-2;before_sent integer;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select count(*) into before_sent from public.ar_sent_events;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_transfer_phuket_12345',0);
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_transfer_khaolak_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region in('phuket','khao-lak');
 foreach h in array array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN'] loop
  reg:=case when h in('KAT','TSK') then 'phuket' else 'khao-lak' end;
  prop:=case h when 'KAT' then 'KT' when 'TSK' then 'TS' when 'TSAN' then 'SAN' when 'WAKL' then 'WAT' when 'TLFO' then 'LFO' else h end;
  oldkey:=prop||'|OLD SYNTHETIC|I:'||scope||'|1';newkey:=prop||'|NEW SYNTHETIC|I:'||scope||'|1';
  insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state,synced_at)
   values(h,scope,'OLD-001','OLD SYNTHETIC','SYNTHETIC',100,0,1,'verified',now()),(h,scope||'-new','NEW-002','OPERA NEW SYNTHETIC','SYNTHETIC',100,0,1,'verified',now());
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
   values(h,scope,'old-i',scope,'FOLIO-003',d-10,100,100,'verified','standalone',false,now());
  perform public.ar_settings_save_v2(actor,h,scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
  perform public.ar_settings_save_v2(actor,h,scope||'-new',0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
  r:=jsonb_build_object('rowKey',oldkey,'hotel',h,'property',prop,'agent','OLD SYNTHETIC','accountNo','OLD-001','invoiceNo',scope,'folio','FOLIO-003','folioNo','FOLIO-003','transactionDate',(d-10)::text,'fields',jsonb_build_object('R',d::text,'S','30','T',(d+30)::text,'U',null,'V',null,'W',null),'locator','{}'::jsonb);
  perform public.ar_tracker_snapshot(actor,reg,lease,jsonb_build_array(r));
  -- Reuse the established destination Account alias rather than create a new
  -- group from the longer OPERA profile name.
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
   values(h,scope||'-new','peer-i',scope||'-peer','PEER-FOLIO',d-10,100,100,'verified','standalone',false,now());
  perform public.ar_tracker_snapshot(actor,reg,lease,jsonb_build_array(jsonb_build_object(
   'rowKey',prop||'|NEW SYNTHETIC|I:'||scope||'-peer|1','hotel',h,'property',prop,'agent','NEW SYNTHETIC','accountNo','NEW-002','invoiceNo',scope||'-peer','folio','PEER-FOLIO','folioNo','PEER-FOLIO','transactionDate',(d-10)::text,
   'fields',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null),'locator','{}'::jsonb)));
  update public.ar_invoices set open=0,verification_state='cleared' where hotel=h and account_id=scope and id='old-i';
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
   values(h,scope||'-new','new-i',scope,'FOLIO-003',d-10,100,100,'verified','standalone',false,now());
  perform public.ar_tracker_snapshot(actor,reg,lease,jsonb_build_array(r));
  j:=public.ar_tracker_transfer_jobs(actor,reg,lease);
  select (v->>'id')::uuid into strict job from jsonb_array_elements(j)v where v->'write'->>'rowKey'=oldkey;
  if not exists(select 1 from jsonb_array_elements(j)v where v->'write'->>'newRowKey'=newkey and v->'write'->>'accountNo'='NEW-002') then raise exception 'wrong frozen target';end if;
  update public.ar_invoices set synced_at=now()-interval '2 hours' where hotel=h and account_id=scope||'-new' and id='new-i';
  if public.ar_tracker_transfer_result(actor,reg,lease,job,'uncertain')->>'state'<>'cancelled' then raise exception 'stale source authorized transfer';end if;
  update public.ar_invoices set synced_at=now() where hotel=h and account_id=scope||'-new' and id='new-i';
  j:=public.ar_tracker_transfer_jobs(actor,reg,lease);
  if not exists(select 1 from jsonb_array_elements(j)v where v->>'id'=job::text and v->>'state'='pending') then raise exception 'fresh source could not revive an unattempted transfer';end if;
  if public.ar_tracker_transfer_result(actor,reg,lease,job,'uncertain')->>'state'<>'uncertain' then raise exception 'intent not durably admitted';end if;
  r:=jsonb_set(jsonb_set(jsonb_set(r,'{rowKey}',to_jsonb(newkey)),'{agent}','"NEW SYNTHETIC"'),'{accountNo}','"NEW-002"');
  perform public.ar_tracker_snapshot(actor,reg,lease,jsonb_build_array(r));
  perform public.ar_tracker_membership(actor,reg,lease,jsonb_build_array(newkey));
  perform public.ar_tracker_transfer_result(actor,reg,lease,job,'written');
  if exists(select 1 from ar_private.tracker_transfer_writes where id=job and state<>'written') then raise exception 'readback receipt lost';end if;
  if (select first_billing_date from public.ar_invoice_workflow where hotel=h and account_id=scope||'-new' and invoice_id='new-i') is distinct from d then raise exception 'transfer changed billing date';end if;
  if exists(select 1 from ar_private.tracker_rows where region=reg and row_key=oldkey and present) then raise exception 'old row remained present';end if;
  if jsonb_array_length(public.ar_tracker_transfer_jobs(actor,reg,lease))<>0 then raise exception 'written transfer recreated';end if;
 end loop;
 if (select count(*) from public.ar_sent_events)<>before_sent then raise exception 'transfer generated mail history';end if;
 if has_function_privilege('authenticated','public.ar_tracker_transfer_jobs(uuid,text,uuid)','EXECUTE') or has_table_privilege('service_role','ar_private.tracker_transfer_writes','SELECT') then raise exception 'transfer journal permissions widened';end if;
end $$;
rollback;
