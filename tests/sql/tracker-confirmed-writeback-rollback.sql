-- Current 13 October contract: verified Sheet dates are authoritative even after Sent.
-- All mail/provider evidence below is local synthetic SQL and rolls back.
begin;
do $$
#variable_conflict use_variable
 declare actor uuid;scope text:='SYNTH-CURRENT-AUTH-'||gen_random_uuid();lease uuid:=gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date-20;f text;variant text;invoice text;key text;delivery uuid;q uuid;row jsonb;incoming date;before_history bigint;before_sent bigint;after_generation bigint;stage text;
 begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'SYNTH-ACCOUNT','Synthetic authority after Sent','SYNTHETIC',1600,0,16,'verified');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_current_authority_original_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 foreach f in array array['R','U','V','W'] loop
  foreach variant in array array['older','same','later','blank'] loop
   invoice:=f||'-'||variant;key:=scope||invoice;delivery:=gen_random_uuid();
   insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,invoice,invoice,'F-'||invoice,d-30,100,100,'verified','standalone',false,now());
   update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope and invoice_id=invoice;
   row:=jsonb_build_object('rowKey',key,'hotel','KAT','accountNo','SYNTH-ACCOUNT','invoiceNo',invoice,'folio','F-'||invoice,'transactionDate',(d-30)::text,'locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null));
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   stage:=case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' when 'W' then 'Follow 3' end;
   insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'));
   insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array[invoice],case f when 'R' then 'billing' else 'collection' end,stage,(d::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
   select id into strict q from ar_private.tracker_outbox where delivery_id=delivery and field=f;
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(d::text),'synthetic-exact-readback');
   select count(*) into before_history from ar_private.tracker_history where row_key=key;
   select count(*) into before_sent from public.ar_sent_events where delivery_id=delivery;
   incoming:=case variant when 'older' then d-1 when 'same' then d when 'later' then d+1 end;
   row:=jsonb_set(row,array['fields',f],coalesce(to_jsonb(incoming::text),'null'::jsonb));
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   if (select actual_date from ar_private.tracker_current_dates where hotel='KAT' and account_id=scope and invoice_id=invoice and field=f) is distinct from incoming then raise exception 'Sheet authority not adopted: % %',f,variant;end if;
   if f='R' and (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id=invoice) is distinct from incoming then raise exception 'R current date not projected';end if;
   if f<>'R' and (select last_reminder_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id=invoice) is distinct from incoming then raise exception 'follow-up clear/date not projected';end if;
   if exists(select 1 from ar_private.tracker_conflicts where row_key=key and field=f and status='pending') then raise exception 'Sheet-master correction incorrectly held';end if;
   if (select count(*) from ar_private.tracker_history where row_key=key)<>before_history+(case when variant='same' then 0 else 1 end) then raise exception 'echo/change authority history not exactly once';end if;
   if (select count(*) from public.ar_sent_events where delivery_id=delivery)<>before_sent or not exists(select 1 from ar_private.tracker_history where delivery_id=delivery and source='confirmed_sent_writeback' and actual_date=d) then raise exception 'Sheet edit rewrote immutable Sent evidence';end if;
   select generation into after_generation from ar_private.tracker_current_dates where hotel='KAT' and account_id=scope and invoice_id=invoice and field=f;
   perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
   if (select generation from ar_private.tracker_current_dates where hotel='KAT' and account_id=scope and invoice_id=invoice and field=f)<>after_generation then raise exception 'equal repeat advanced authority generation';end if;
   if exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) item where item->>'id'=q::text) then raise exception 'old written intent returned for stale restoration';end if;
  end loop;
 end loop;
 if exists(select 1 from public.ar_invoices where account_id=scope and (open<>100 or original<>100)) then raise exception 'Sheet corrections changed OPERA money';end if;
 end $$;
rollback;
