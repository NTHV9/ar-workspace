-- LOCAL synthetic SQL-only unknown-intent controls; no provider/mail operation.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-NATIVE-UNKNOWN-'||gen_random_uuid();region text;hotel text;lease uuid;d2 date:=(now() at time zone 'Asia/Bangkok')::date-20;old_delivery uuid;new_delivery uuid;other_delivery uuid;job uuid;result jsonb;rows jsonb;preview uuid;items jsonb;filler integer;delivery uuid;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach region in array array['phuket','khao-lak'] loop
  hotel:=case region when 'phuket' then 'KAT' else 'TSAN' end;lease:=gen_random_uuid();old_delivery:=gen_random_uuid();new_delivery:=gen_random_uuid();other_delivery:=gen_random_uuid();
  insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values(hotel,scope,'0002','Synthetic uncertainty','SYNTHETIC',200,0,2,'verified');
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(hotel,scope,'i','00001','F1',d2-30,100,100,'verified','standalone',false,now()),(hotel,scope,'other','00002','F2',d2-30,100,100,'verified','standalone',false,now());
  perform public.ar_settings_save_v2(actor,hotel,scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
  rows:=jsonb_build_array(jsonb_build_object('rowKey','SYNTH-I-'||region,'hotel',hotel,'accountNo','0002','invoiceNo','00001','folio','F1','fields',jsonb_build_object('R',(d2-10)::text,'S','30','T',(d2+20)::text,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null),'locator','{}'::jsonb),jsonb_build_object('rowKey','SYNTH-OTHER-'||region,'hotel',hotel,'accountNo','0002','invoiceNo','00002','folio','F2','fields',jsonb_build_object('R',(d2-10)::text,'S','30','T',(d2+20)::text,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null),'locator','{}'::jsonb));
  perform public.ar_tracker_connect(actor,region,'synthetic_uncertainty_tracker_12345',0);result:=public.ar_tracker_preview(actor,region,'synthetic_uncertainty_tracker_12345','synthetic-v1',repeat('a',64),rows);preview:=(result->>'previewId')::uuid;perform public.ar_tracker_confirm_preview(actor,region,preview,repeat('a',64),'synthetic-v1');perform public.ar_tracker_claim(actor,region,lease,true);
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(old_delivery,actor,'send','synthetic-unknown-'||old_delivery,'{}','sent','synthetic-unknown-'||old_delivery,(d2::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(old_delivery,actor,hotel,scope,array['i'],'collection','Follow 1',(d2::timestamp at time zone 'Asia/Bangkok'),'synthetic-unknown-'||old_delivery,100);
  select id into strict job from ar_private.tracker_outbox where delivery_id=old_delivery;
  perform public.ar_tracker_write_result(actor,region,lease,job,'uncertain','null',to_jsonb(d2::text),'synthetic-observed');
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(new_delivery,actor,'send','synthetic-unknown-'||new_delivery,'{}','sent','synthetic-unknown-'||new_delivery,((d2+1)::timestamp at time zone 'Asia/Bangkok')),(other_delivery,actor,'send','synthetic-unknown-'||other_delivery,'{}','sent','synthetic-unknown-'||other_delivery,((d2+1)::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(new_delivery,actor,hotel,scope,array['i'],'collection','Follow 1',((d2+1)::timestamp at time zone 'Asia/Bangkok'),'synthetic-unknown-'||new_delivery,100),(other_delivery,actor,hotel,scope,array['other'],'collection','Follow 2',((d2+1)::timestamp at time zone 'Asia/Bangkok'),'synthetic-unknown-'||other_delivery,100);
  items:=public.ar_tracker_outbox(actor,region,lease);
  if region='phuket' then
   if not exists(select 1 from jsonb_array_elements(items) item where item->>'id'=job::text and item->>'value'=(d2+1)::text) or not exists(select 1 from jsonb_array_elements(items) item where item->>'deliveryId'=new_delivery::text) then raise exception 'Phuket CAS queue semantics changed';end if;
  else
   if not exists(select 1 from jsonb_array_elements(items) item where item->>'id'=job::text and item->>'value'=d2::text and item->'expected'='null') then raise exception 'native uncertain intended date/preimage drifted to newer Sent';end if;
   if exists(select 1 from jsonb_array_elements(items) item where item->>'deliveryId'=new_delivery::text) then raise exception 'native pending sibling bypassed canonical uncertain fence';end if;
   if not exists(select 1 from jsonb_array_elements(items) item where item->>'deliveryId'=other_delivery::text) then raise exception 'native unrelated canonical field was blocked';end if;
   perform public.ar_tracker_write_result(actor,region,lease,job,'uncertain','"later external edit"',to_jsonb((d2+1)::text),'synthetic-new-observation');
   if (select desired_value from ar_private.tracker_outbox where id=job) is distinct from to_jsonb(d2::text) or (select expected_value from ar_private.tracker_outbox where id=job) is distinct from 'null'::jsonb then raise exception 'native rearm rewrote original uncertain intent';end if;
   -- Force unknown job beyond the 100-row page; the fence must stay global.
   for filler in 1..101 loop
    delivery:=gen_random_uuid();insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(delivery,actor,'send','synthetic-page-'||delivery,'{}','sent');
    insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,hotel,scope,array['other'],'collection','Follow 2',(d2::timestamp at time zone 'Asia/Bangkok'),'synthetic-page-'||delivery,100);
   end loop;
   update ar_private.tracker_outbox q set state='held',updated_at=now()-interval '2 days' where q.hotel=hotel and q.account_id=scope and q.invoice_id='other';
   update ar_private.tracker_outbox set updated_at=now()+interval '1 day' where id=job;
   update ar_private.tracker_outbox set updated_at=now()-interval '3 days' where delivery_id=new_delivery;
   items:=public.ar_tracker_outbox(actor,region,lease);if jsonb_array_length(items)<>100 or exists(select 1 from jsonb_array_elements(items) item where item->>'deliveryId'=new_delivery::text) then raise exception 'native unknown fence depends on current 100-row page';end if;
  end if;
  perform public.ar_tracker_finish(actor,region,lease,'synthetic-v1',null);
 end loop;
end $$;
rollback;
