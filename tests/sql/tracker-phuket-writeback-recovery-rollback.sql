-- Synthetic only; all data and simulated source edits roll back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-PHUKET-RECOVERY-'||gen_random_uuid();lease uuid:=gen_random_uuid();
 d date:=(now() at time zone 'Asia/Bangkok')::date-10;v text;invoice text;key text;delivery uuid;q uuid;
 row jsonb;items jsonb;receipt jsonb;before_history bigint;before_events bigint;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state)
 values('TSK',scope,'SYNTH-RECOVERY','Synthetic Phuket recovery','SYNTHETIC',600,0,6,'verified');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_phuket_recovery_original_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 foreach v in array array['conflict','uncertain_echo','conflict_echo','receipt_race','edited','deleted'] loop
  invoice:=v;key:=scope||'-'||v;delivery:=gen_random_uuid();
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
  values('TSK',scope,invoice,invoice,'F-'||v,d-20,100,100,'verified','standalone',false,now());
  update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='TSK' and account_id=scope and invoice_id=invoice;
  row:=jsonb_build_object('rowKey',key,'hotel','TSK','accountNo','SYNTH-RECOVERY','invoiceNo',invoice,'folio','F-'||v,'transactionDate',(d-20)::text,'locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null));
  perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
  values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
  values(delivery,actor,'TSK',scope,array[invoice],'billing',null,(d::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
  select id into strict q from ar_private.tracker_outbox where delivery_id=delivery and field='R';
  if v in('conflict','conflict_echo','edited','deleted') then
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'conflict','null',to_jsonb(d::text),'synthetic-conflict');
  else
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'uncertain','null',to_jsonb(d::text),'synthetic-unknown');
  end if;
  if v='conflict' then
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   if exists(select 1 from ar_private.tracker_conflicts where row_key=key and field='R' and status='pending') then raise exception 'unchanged source conflict did not resolve';end if;
   items:=public.ar_tracker_outbox(actor,'phuket',lease);
   if not exists(select 1 from jsonb_array_elements(items)x where x->>'id'=q::text and x->>'state'='conflict' and x->>'expected' is null) then raise exception 'unchanged confirmed-Sent conflict permanently excluded from retry';end if;
   if (public.ar_tracker_status(actor,'phuket')->>'pending')::integer<1 then raise exception 'retryable conflict missing from pending count';end if;
   -- A normal successful conditional upload is acknowledged through the existing receipt.
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(d::text),'synthetic-success');
  elsif v in('uncertain_echo','conflict_echo','receipt_race') then
   row:=jsonb_set(row,'{fields,R}',to_jsonb(d::text));
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   items:=public.ar_tracker_outbox(actor,'phuket',lease);
   if not exists(select 1 from jsonb_array_elements(items)x where x->>'id'=q::text and x->>'value'=d::text) then raise exception 'exact echo excluded after authority generation advanced: %',v;end if;
   if v='receipt_race' then
    row:=jsonb_set(row,'{fields,R}','null');
    perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   end if;
   select count(*) into before_history from ar_private.tracker_history where row_key=key;
   receipt:=public.ar_tracker_write_result(actor,'phuket',lease,q,'written',to_jsonb(d::text),to_jsonb(d::text),'synthetic-readback-only');
   if v='receipt_race' then
    if receipt->>'state' is distinct from 'suppressed' or (select actual_date from ar_private.tracker_current_dates where hotel='TSK' and account_id=scope and invoice_id=invoice and field='R') is not null
     or (select count(*) from ar_private.tracker_history where row_key=key)<>before_history then raise exception 'late receipt overrode newer employee deletion';end if;
   elsif receipt->>'state' is distinct from 'written' or (select actual_date from ar_private.tracker_current_dates where hotel='TSK' and account_id=scope and invoice_id=invoice and field='R') is distinct from d then raise exception 'exact echo was not safely acknowledged: %',v;end if;
  else
   row:=jsonb_set(row,'{fields,R}',to_jsonb((d+1)::text));
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   if v='deleted' then row:=jsonb_set(row,'{fields,R}','null');perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));end if;
   items:=public.ar_tracker_outbox(actor,'phuket',lease);
   if exists(select 1 from jsonb_array_elements(items)x where x->>'id'=q::text) then raise exception 'old conflict returned after employee edit/deletion';end if;
  end if;
  if (select count(*) from public.ar_sent_events where delivery_id=delivery)<>1 or (select open from public.ar_invoices where hotel='TSK' and account_id=scope and id=invoice)<>100 then raise exception 'writeback recovery altered Sent identity or money';end if;
 end loop;
 begin
  perform public.ar_tracker_status(gen_random_uuid(),'phuket');
  raise exception 'unknown actor read tracker state';
 exception when others then if sqlerrm<>'tracker_forbidden' then raise;end if;end;
end$$;
rollback;
