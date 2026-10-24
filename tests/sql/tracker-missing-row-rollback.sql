-- Fresh local synthetic database only. No provider or actual mail operation.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-MISSING-'||gen_random_uuid();h text;region text;lease uuid:=gen_random_uuid();delivery uuid;items jsonb;row jsonb;d date:=(now() at time zone 'Asia/Bangkok')::date-1;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 foreach h in array array['KAT','TSAN'] loop
  region:=case h when 'KAT' then 'phuket' else 'khao-lak' end;
  insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state)
  values(h,scope||'-old','SYN-OLD','Synthetic old ledger','SYNTHETIC',0,0,1,'verified'),
        (h,scope||'-new','SYN-NEW','Synthetic new ledger','SYNTHETIC',200,0,2,'verified');
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
  values(h,scope||'-old','old','SYN-SHARED','SYN-FOLIO',d-30,100,0,'cleared','standalone',false,now()),
        (h,scope||'-new','new','SYN-SHARED','SYN-FOLIO',d-30,100,100,'verified','standalone',false,now()),
        (h,scope||'-new','missing','SYN-ABSENT','SYN-ABSENT-FOLIO',d-30,100,100,'verified','standalone',false,now());
  perform public.ar_tracker_connect(actor,region,'synthetic_missing_'||region||'_original_12345',0);
  update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where tracker_bindings.region=region;
  row:=jsonb_build_object('rowKey',scope||h,'hotel',h,'accountNo','SYN-OLD','invoiceNo','SYN-SHARED','folio','SYN-FOLIO','transactionDate',(d-30)::text,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null),'locator','{}'::jsonb);
  perform public.ar_tracker_snapshot(actor,region,lease,jsonb_build_array(row));
  if not exists(select 1 from ar_private.tracker_rows r where r.region=region and r.row_key=scope||h and r.account_id=scope||'-old' and r.invoice_id='old') then raise exception 'nonblank Sheet account identity was not retained';end if;
  delivery:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
  values(delivery,actor,'send','synthetic-'||delivery,jsonb_build_object('expected',jsonb_build_object('mailbox',region,'sender',case h when 'KAT' then 'ar@katathani.com' else 'ar@thesandskhaolak.com' end)),'sent','synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
  values(delivery,actor,h,scope||'-new',array['new','missing'],'billing',null,(d::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,200);
  if (select count(*) from ar_private.tracker_outbox q where q.delivery_id=delivery and q.state='pending' and q.attempts=0)<>2 then raise exception 'confirmed Sent intent missing or unexpectedly attempted';end if;
  items:=public.ar_tracker_outbox(actor,region,lease);
  if exists(select 1 from jsonb_array_elements(items) q where q->>'deliveryId'=delivery::text) then raise exception 'unmapped sent invoice reached provider consumer';end if;
  if exists(select 1 from ar_private.tracker_outbox q where q.delivery_id=delivery and q.state<>'pending') then raise exception 'missing provider identity fabricated a completed receipt';end if;
  if exists(select 1 from ar_private.tracker_history t where t.delivery_id=delivery) then raise exception 'missing Sheet mapping fabricated written history';end if;
 end loop;
end $$;
rollback;
