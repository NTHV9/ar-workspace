-- LOCAL synthetic rollback regression. No provider, email or cloud operation.
-- Each delivery below is SQL fixture evidence, never a genuine business send.
begin;
create temp table tracker_sent_reversion_observations(field text,variant text,conflicts integer,baseline_value jsonb,accepted_date date,workflow_date date,current_stage_date date,outbox_state text,sheet_actual_history integer,confirmed_history integer,due_unchanged boolean);
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-SENT-REVERSION-'||gen_random_uuid();lease uuid:=gen_random_uuid();d2 date:=(now() at time zone 'Asia/Bangkok')::date-20;field text;variant text;invoice text;row_key text;delivery uuid;newer_delivery uuid;q uuid;rows jsonb:='[]';one jsonb;result jsonb;preview uuid;w public.ar_invoice_workflow;stage text;incoming jsonb;due_before date;conflict uuid;revision integer;before_events bigint;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'0002','Synthetic confirmed-writeback regression','SYNTHETIC',1500,0,15,'verified');
 foreach field in array array['U','V','W'] loop
  foreach variant in array array['older','same','later','blank','batched'] loop
   invoice:=field||'-'||variant;row_key:='SYNTH-WRITTEN-'||invoice;
   insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,invoice,'00001-'||invoice,'F-'||invoice,d2-30,100,100,'verified','standalone',false,now());
   rows:=rows||jsonb_build_array(jsonb_build_object('rowKey',row_key,'hotel','KAT','accountNo','0002','invoiceNo','00001-'||invoice,'folio','F-'||invoice,'transactionDate',(d2-30)::text,'locator',jsonb_build_object('synthetic',true),'fields',jsonb_build_object('R',(d2-10)::text,'S','30','T',(d2+20)::text,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null)));
  end loop;
 end loop;
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 result:=public.ar_tracker_connect(actor,'phuket','synthetic_written_reversion_12345',0);if result->>'connected' is distinct from 'true' then raise exception 'synthetic reversion connect failed';end if;
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_written_reversion_12345','synthetic-v1',repeat('a',64),rows);preview:=(result->>'previewId')::uuid;
 result:=public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('a',64),'synthetic-v1');if result->>'confirmed' is distinct from 'true' then raise exception 'synthetic reversion bootstrap failed';end if;
 result:=public.ar_tracker_claim(actor,'phuket',lease,true);if result->>'status' is distinct from 'claimed' then raise exception 'synthetic reversion lease failed';end if;
 foreach field in array array['U','V','W'] loop
  stage:=case field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end;
  foreach variant in array array['older','same','later','blank','batched'] loop
   invoice:=field||'-'||variant;row_key:='SYNTH-WRITTEN-'||invoice;delivery:=gen_random_uuid();
   select * into strict w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id=invoice;
   insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,created_at) values(delivery,actor,'send',stage,'synthetic-sent-reversion-'||delivery,jsonb_build_object('draft',jsonb_build_object('hotel','KAT','account_id',scope,'invoice_ids',jsonb_build_array(invoice),'purpose','collection'),'workflow',jsonb_build_array(to_jsonb(w)),'manifest',jsonb_build_array(jsonb_build_object('open',100))),'awaiting_evidence',((case when variant='batched' then d2-1 else d2 end)::timestamp at time zone 'Asia/Bangkok'));
   result:=public.ar_mail_confirm_sent(actor,delivery,'synthetic-sent-reversion-'||delivery,((case when variant='batched' then d2-1 else d2 end)::timestamp at time zone 'Asia/Bangkok')+interval '12 hours');if result->>'recorded' is distinct from 'true' then raise exception 'synthetic confirmed Sent fixture failed';end if;
   if variant='batched' then
    newer_delivery:=gen_random_uuid();select * into strict w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id=invoice;
    insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,created_at) values(newer_delivery,actor,'send',stage,'synthetic-sent-reversion-'||newer_delivery,jsonb_build_object('draft',jsonb_build_object('hotel','KAT','account_id',scope,'invoice_ids',jsonb_build_array(invoice),'purpose','collection'),'workflow',jsonb_build_array(to_jsonb(w)),'manifest',jsonb_build_array(jsonb_build_object('open',100))),'awaiting_evidence',(d2::timestamp at time zone 'Asia/Bangkok'));
    perform public.ar_mail_confirm_sent(actor,newer_delivery,'synthetic-sent-reversion-'||newer_delivery,(d2::timestamp at time zone 'Asia/Bangkok')+interval '12 hours');
    if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) item where item->>'deliveryId'=delivery::text and item->>'value'=d2::text) then raise exception 'older queued delivery did not derive newer canonical Sent day';end if;
   end if;
   select id into strict q from ar_private.tracker_outbox where delivery_id=delivery and invoice_id=invoice and tracker_outbox.field=field;
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(d2::text),'synthetic-written-v2');
   if not exists(select 1 from ar_private.tracker_history h where h.region='phuket' and h.row_key=row_key and h.field=field and h.source='confirmed_sent_writeback' and h.delivery_id=delivery and h.actual_date=d2) then raise exception 'confirmed written provenance fixture missing';end if;
   select due_date into due_before from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id=invoice;
   incoming:=case variant when 'older' then to_jsonb((d2-1)::text) when 'batched' then to_jsonb((d2-1)::text) when 'same' then to_jsonb(d2::text) when 'later' then to_jsonb((d2+1)::text) else 'null'::jsonb end;
   select value into one from jsonb_array_elements(rows) where value->>'rowKey'=row_key;one:=jsonb_set(one,array['fields',field],incoming);
   result:=public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(one));
   insert into tracker_sent_reversion_observations
   select field,variant,(select count(*) from ar_private.tracker_conflicts c where c.region='phuket' and c.row_key=row_key and c.field=field and c.status='pending'),r.baseline->field,(select actual_date from ar_private.tracker_accepted_facts f where f.region='phuket' and f.row_key=row_key and f.field=field),wf.last_reminder_date,(select (latest_sent_at at time zone 'Asia/Bangkok')::date from ar_private.dashboard_current_invoices di where di.hotel='KAT' and di.account_id=scope and di.invoice_id=invoice),o.state,(select count(*) from ar_private.tracker_history h where h.region='phuket' and h.row_key=row_key and h.field=field and h.source='sheet_actual'),(select count(*) from ar_private.tracker_history h where h.region='phuket' and h.row_key=row_key and h.field=field and h.source='confirmed_sent_writeback'),wf.due_date=due_before
   from ar_private.tracker_rows r join public.ar_invoice_workflow wf on wf.hotel=r.hotel and wf.account_id=r.account_id and wf.invoice_id=r.invoice_id join ar_private.tracker_outbox o on o.id=q where r.region='phuket' and r.row_key=row_key;
  end loop;
 end loop;
 if exists(select 1 from tracker_sent_reversion_observations where not due_unchanged) or (select credit_term from public.ar_account_settings where hotel='KAT' and account_id=scope)<>30 or exists(select 1 from public.ar_invoices where hotel='KAT' and account_id=scope and open<>100) then raise exception 'synthetic reversion changed financial/rule fields';end if;
 if exists(select 1 from tracker_sent_reversion_observations obs where obs.variant='same' and (conflicts<>0 or accepted_date is not null or sheet_actual_history<>0 or workflow_date<>d2 or baseline_value<>to_jsonb(d2::text))) then raise exception 'same confirmed date stopped being an idempotent echo';end if;
 if exists(select 1 from tracker_sent_reversion_observations obs where obs.variant='blank' and (conflicts=0 or accepted_date is not null or sheet_actual_history<>0 or workflow_date<>d2 or baseline_value<>to_jsonb(d2::text))) then raise exception 'blank confirmed date stopped being held';end if;
 if exists(select 1 from tracker_sent_reversion_observations obs where obs.variant='later' and (conflicts<>0 or accepted_date<>d2+1 or sheet_actual_history<>1 or workflow_date<>d2+1 or baseline_value<>to_jsonb((d2+1)::text))) then raise exception 'later legitimate Sheet fact stopped importing';end if;
 if exists(select 1 from tracker_sent_reversion_observations obs where obs.variant in('older','batched') and (conflicts=0 or sheet_actual_history<>0 or accepted_date is not null or baseline_value<>to_jsonb(d2::text))) then raise exception 'confirmed written U/V/W older date silently imported';end if;
 -- Existing reviewed choices remain explicit acknowledgments, not auto writes.
 invoice:='U-older';row_key:='SYNTH-WRITTEN-'||invoice;
 select id,tracker_conflicts.revision into strict conflict,revision from ar_private.tracker_conflicts where region='phuket' and tracker_conflicts.row_key=row_key and tracker_conflicts.field='U' and status='pending';
 select count(*) into before_events from public.ar_sent_events;
 perform public.ar_tracker_resolve(actor,'phuket',conflict,revision,'keep_web');
 if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) item where item->>'rowKey'=row_key and item->>'expected'=(d2-1)::text and item->>'value'=d2::text and item->>'state'='pending') then raise exception 'Keep AR did not requeue with fresh Sheet preimage';end if;
 select id into strict q from ar_private.tracker_outbox where account_id=scope and invoice_id=invoice and tracker_outbox.field='U';
 perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written',to_jsonb((d2-1)::text),to_jsonb(d2::text),'synthetic-review-v3');
 select value into one from jsonb_array_elements(rows) where value->>'rowKey'=row_key;one:=jsonb_set(one,'{fields,U}',to_jsonb(d2::text));perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(one));
 if exists(select 1 from ar_private.tracker_conflicts where tracker_conflicts.row_key=row_key and status='pending') then raise exception 'fresh confirmed writeback echo reopened review';end if;
 invoice:='V-older';row_key:='SYNTH-WRITTEN-'||invoice;
 select id,tracker_conflicts.revision into strict conflict,revision from ar_private.tracker_conflicts where region='phuket' and tracker_conflicts.row_key=row_key and tracker_conflicts.field='V' and status='pending';
 perform public.ar_tracker_resolve(actor,'phuket',conflict,revision,'accept_sheet');
 select value into one from jsonb_array_elements(rows) where value->>'rowKey'=row_key;one:=jsonb_set(one,'{fields,V}',to_jsonb((d2-1)::text));perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(one));
 if exists(select 1 from ar_private.tracker_conflicts where tracker_conflicts.row_key=row_key and status='pending') or (select count(*) from public.ar_sent_events)<>before_events then raise exception 'reviewed Sheet baseline acknowledgment reopened or changed Gmail';end if;
end $$;
select field,variant,conflicts,baseline_value,accepted_date,workflow_date,current_stage_date,outbox_state,sheet_actual_history,confirmed_history,due_unchanged from tracker_sent_reversion_observations order by field,variant;
rollback;
