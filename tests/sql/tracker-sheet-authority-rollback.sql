-- Owned local synthetic data only. Every mutation rolls back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-SHEET-AUTH-'||gen_random_uuid();lease uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();delivery2 uuid:=gen_random_uuid();job uuid;rows jsonb;r jsonb;result jsonb;d date:=(now() at time zone 'Asia/Bangkok')::date-20;g bigint;cnt bigint;items jsonb;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('TSAN',scope,'SYNTH-007','Synthetic authority','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'i','SYNTH-INVOICE','SYNTH-FOLIO',d-30,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'TSAN',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_authority_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 r:=jsonb_build_object('rowKey',scope,'hotel','TSAN','accountNo','','invoiceNo','SYNTH-INVOICE','folio','SYNTH-FOLIO','transactionDate',(d-30)::text,'fields',jsonb_build_object('R',d::text,'S','30','T',(d+30)::text,'U',(d+1)::text,'V',(d+2)::text,'W',(d+3)::text),'locator','{}'::jsonb);
 rows:=jsonb_build_array(r);
 result:=public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if result?'error' then raise exception 'initial snapshot rejected: %',result;end if;
 if (select count(*) from ar_private.tracker_current_dates where account_id=scope)<>4 then raise exception 'complete unique blank-account identity was not adopted';end if;
 if (select first_billing_date from public.ar_invoice_workflow where account_id=scope) is distinct from d then raise exception 'R not applied';end if;
 if (select last_reminder_stage from public.ar_invoice_workflow where account_id=scope) is distinct from 'Follow 3' then raise exception 'W stage not applied';end if;
 if (select identity->>'accountNo' from ar_private.tracker_rows where row_key=scope)<>'' then raise exception 'provider identity blank was changed';end if;
 select sum(generation) into g from ar_private.tracker_current_dates where account_id=scope;
 select count(*) into cnt from ar_private.tracker_history where account_id=scope;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if (select sum(generation) from ar_private.tracker_current_dates where account_id=scope)<>g or (select count(*) from ar_private.tracker_history where account_id=scope)<>cnt then raise exception 'equal poll advanced generation/history';end if;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'TSAN',scope,array['i'],'billing',null,(d::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery;
 if (select desired_value from ar_private.tracker_outbox where id=job) is distinct from to_jsonb(d) then raise exception 'R intent not frozen';end if;
 rows:=jsonb_build_array(jsonb_set(r,'{fields}',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null)));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if exists(select 1 from ar_private.tracker_current_dates where account_id=scope and actual_date is not null) then raise exception 'clear did not clear all mapped dates';end if;
 if exists(select 1 from public.ar_invoice_workflow where account_id=scope and (first_billing_date is not null or due_date is not null or last_reminder_stage is not null or last_reminder_date is not null)) then raise exception 'clear resurrected workflow or due';end if;
 if (select state from ar_private.tracker_outbox where id=job)<>'suppressed' then raise exception 'old pending send not terminally suppressed';end if;
 if not exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'immutable Sent deleted';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if (select state from ar_private.tracker_outbox where id=job)<>'suppressed' then raise exception 'poll revived old command';end if;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+5)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['i'],'collection','Follow 1',((d+5)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
 items:=public.ar_tracker_outbox(actor,'khao-lak',lease);
 if not exists(select 1 from jsonb_array_elements(items) x where x->>'deliveryId'=delivery2::text and x->>'value'=(d+5)::text) then raise exception 'new send after clear not publishable or intent drifted: %',items;end if;
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery2;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'uncertain','null',to_jsonb((d+5)::text),'synthetic-unknown');
 rows:=jsonb_build_array(jsonb_set(r,'{fields}',jsonb_build_object('R',(d+8)::text,'S','30','T',(d+38)::text,'U',(d+8)::text,'V',null,'W',null)));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if (select state from ar_private.tracker_outbox where id=job)<>'uncertain' or (select desired_value from ar_private.tracker_outbox where id=job) is distinct from to_jsonb((d+5)::text) then raise exception 'uncertain attempted value altered';end if;
 if (select due_date from public.ar_invoice_workflow where account_id=scope) is distinct from d+38 then raise exception 'corrected R due not recomputed';end if;
 if not exists(select 1 from ar_private.tracker_report_current_events where account_id=scope and purpose='billing' and source='sheet_actual' and (sent_at at time zone 'Asia/Bangkok')::date=d+8) then raise exception 'authoritative R missing from current report';end if;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'written','null',to_jsonb((d+5)::text),'synthetic-exact-readback');
 if (select actual_date from ar_private.tracker_current_dates where account_id=scope and field='U') is distinct from d+8 then raise exception 'uncertain readback overwrote newer authority';end if;
 if (select sheet_values->>'U' from ar_private.tracker_rows where row_key=scope) is distinct from (d+8)::text then raise exception 'uncertain receipt overwrote newer observed row';end if;
 delivery2:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+10)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['i'],'collection','Follow 2',((d+10)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery2;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'written','null',to_jsonb((d+10)::text),'synthetic-exact');
 if (select actual_date from ar_private.tracker_current_dates where account_id=scope and field='V') is distinct from d+10 or (select last_reminder_stage from public.ar_invoice_workflow where account_id=scope) is distinct from 'Follow 2' then raise exception 'new written receipt not immediately published';end if;
 -- Clearing all mapped dates still preserves unmapped actual web stages.
 begin
  delivery2:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+11)::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['i'],'collection','Friendly',((d+11)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
  rows:=jsonb_build_array(jsonb_set(r,'{fields}',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null)));
  perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
  if (select last_reminder_stage from public.ar_invoice_workflow where account_id=scope) is distinct from 'Friendly' then raise exception 'Friendly actual evidence lost';end if;
  delivery2:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+12)::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['i'],'collection','Final',((d+12)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
  perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
  if (select last_reminder_stage from public.ar_invoice_workflow where account_id=scope) is distinct from 'Final' then raise exception 'Final actual evidence lost';end if;
 end;
 select sum(generation) into g from ar_private.tracker_current_dates where account_id=scope;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r||jsonb_build_object('reviewFence',jsonb_build_object('workflow',-1,'tracking',0,'exception',0))));
 if (select sum(generation) from ar_private.tracker_current_dates where account_id=scope)<>g then raise exception 'stale preview adopted authority';end if;
 if strpos(pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure),'q.desired_value as value')=0 then raise exception 'outbox still computes latest dynamic value';end if;
 -- Wrong nonempty account and incomplete blank identity must remain held.
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r||jsonb_build_object('rowKey',scope||'-wrong','accountNo','WRONG')));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array((r-'transactionDate')||jsonb_build_object('rowKey',scope||'-incomplete')));
 if exists(select 1 from ar_private.tracker_rows where row_key in(scope||'-wrong',scope||'-incomplete') and account_id is not null) then raise exception 'unsafe account fallback';end if;
 -- A new invoice can be genuinely sent before its first source observation.
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'fresh','SYNTH-FRESH','SYNTH-FRESH-FOLIO',d-30,100,100,'verified','standalone',false,now());
 delivery2:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+13)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['fresh'],'billing',null,((d+13)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
 delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery,((d+14)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'TSAN',scope,array['fresh'],'billing',null,((d+14)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
 if (select desired_value from ar_private.tracker_outbox where delivery_id=delivery) is distinct from to_jsonb((d+13)::text) then raise exception 'rebill coalescing lost earliest R intent';end if;
 delivery2:=delivery;
 rows:=jsonb_build_array(r||jsonb_build_object('rowKey',scope||'-fresh','invoiceNo','SYNTH-FRESH','folio','SYNTH-FRESH-FOLIO','fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null)));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery2;
 if (select state from ar_private.tracker_outbox where id=job)<>'pending' or (select authority_generation from ar_private.tracker_outbox where id=job)<>1 then raise exception 'genuine new send preceding initial blank snapshot was lost';end if;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'written','null',to_jsonb((d+13)::text),'synthetic-new-first');
 if (select first_billing_date from public.ar_invoice_workflow where account_id=scope and invoice_id='fresh') is distinct from d+13 then raise exception 'new first R publication not reflected';end if;
 -- Confirm ordering writes workflow before setting delivery.state=sent.
 delivery2:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','awaiting_evidence','synthetic-'||delivery2,((d+14)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['fresh'],'collection','Final',((d+14)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
 update public.ar_invoice_workflow set last_reminder_stage='Final',last_reminder_date=d+14,revision=revision+1 where account_id=scope and invoice_id='fresh';
 update ar_private.mail_deliveries set state='sent' where id=delivery2;
 if (select last_reminder_stage from public.ar_invoice_workflow where account_id=scope and invoice_id='fresh') is distinct from 'Final' then raise exception 'in-flight actual Final overwritten by authority guard';end if;
 -- Two queued actual days produce one latest unattempted mapped intent.
 delivery:=gen_random_uuid();delivery2:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery,((d+15)::timestamp at time zone 'Asia/Bangkok')),(delivery2,actor,'send','synthetic-'||delivery2,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery2,((d+16)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'TSAN',scope,array['fresh'],'collection','Follow 1',((d+15)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery2,actor,'TSAN',scope,array['fresh'],'collection','Follow 1',((d+16)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery2,100);
 if (select state from ar_private.tracker_outbox where delivery_id=delivery)<>'suppressed' then raise exception 'older queued same-field intent not coalesced';end if;
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery2;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'uncertain','null',to_jsonb((d+16)::text),'synthetic-attempt');
 delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery,((d+17)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'TSAN',scope,array['fresh'],'collection','Follow 1',((d+17)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
 items:=public.ar_tracker_outbox(actor,'khao-lak',lease);
 if exists(select 1 from jsonb_array_elements(items) x where x->>'deliveryId'=delivery::text) then raise exception 'new sibling bypassed uncertain global fence';end if;
 -- Production service observes source before reconciling unknown native writes.
 rows:=jsonb_build_array(r||jsonb_build_object('rowKey',scope||'-fresh','invoiceNo','SYNTH-FRESH','folio','SYNTH-FRESH-FOLIO','fields',jsonb_build_object('R',(d+13)::text,'U',(d+16)::text,'V',null,'W',null)));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,rows);
 if (select state from ar_private.tracker_outbox where delivery_id=delivery)<>'pending' then raise exception 'source echo before reconciliation discarded newer follow-up';end if;
 items:=public.ar_tracker_outbox(actor,'khao-lak',lease);
 if exists(select 1 from jsonb_array_elements(items) x where x->>'deliveryId'=delivery::text) then raise exception 'source echo bypassed unresolved native sibling fence';end if;
 perform public.ar_tracker_write_result(actor,'khao-lak',lease,job,'written','null',to_jsonb((d+16)::text),'synthetic-attempt-confirmed');
 if (select state from ar_private.tracker_outbox where delivery_id=delivery)<>'pending' or (select desired_value from ar_private.tracker_outbox where delivery_id=delivery) is distinct from to_jsonb((d+17)::text) then raise exception 'older receipt discarded or changed newer frozen intent';end if;
 items:=public.ar_tracker_outbox(actor,'khao-lak',lease);
 if not exists(select 1 from jsonb_array_elements(items) x where x->>'deliveryId'=delivery::text and x->>'value'=(d+17)::text) then raise exception 'rebased newer intent not publishable';end if;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'ambiguous','SYNTH-INVOICE','SYNTH-FOLIO',d-30,100,100,'verified','standalone',false,now());
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r||jsonb_build_object('rowKey',scope||'-ambiguous')));
 if exists(select 1 from ar_private.tracker_rows where row_key=scope||'-ambiguous' and account_id is not null) then raise exception 'ambiguous complete identity guessed';end if;
 -- Phuket uncertain jobs have no read-only native reconciliation path. A
 -- superseded generation must stay durable but never return for provider retry.
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'SYNTH-PHUKET','Synthetic Phuket authority','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'p','SYNTH-PHUKET-INVOICE','SYNTH-PHUKET-FOLIO',d-30,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_phuket_authority_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 r:=jsonb_build_object('rowKey',scope||'-phuket','hotel','KAT','accountNo','SYNTH-PHUKET','invoiceNo','SYNTH-PHUKET-INVOICE','folio','SYNTH-PHUKET-FOLIO','transactionDate',(d-30)::text,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null),'locator','{}'::jsonb);
 perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(r));
 delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,((d+15)::timestamp at time zone 'Asia/Bangkok'));
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array['p'],'collection','Follow 1',((d+15)::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
 select id into strict job from ar_private.tracker_outbox where delivery_id=delivery;
 perform public.ar_tracker_write_result(actor,'phuket',lease,job,'uncertain','null',to_jsonb((d+15)::text),'synthetic-phuket-unknown');
 perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(jsonb_set(r,'{fields,U}',to_jsonb((d+16)::text))));
 perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(r));
 items:=public.ar_tracker_outbox(actor,'phuket',lease);
 if exists(select 1 from jsonb_array_elements(items) x where x->>'id'=job::text) or (select state from ar_private.tracker_outbox where id=job)<>'uncertain' then raise exception 'Phuket superseded unknown returned for stale retry or lost evidence';end if;
end $$;
rollback;

