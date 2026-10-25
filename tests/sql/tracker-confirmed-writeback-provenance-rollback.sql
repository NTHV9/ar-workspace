-- Current synthetic receipt provenance controls, without forged history receipts.
begin;
do $$
#variable_conflict use_variable
 declare actor uuid;scope text:='SYNTH-PROVENANCE-'||gen_random_uuid();lease uuid:=gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date-20;kind text;row jsonb;delivery uuid;q uuid;expected boolean;observed boolean;cache_mode text;query_plan json;proof_invoice text;proof_field text;sent_day date;rejected boolean;before_bad bigint;
 begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'SYNTH-ACCOUNT','Synthetic receipt provenance','SYNTHETIC',500,0,5,'verified');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_provenance_original_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 cache_mode:=current_setting('plan_cache_mode');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'anchor','anchor','F-anchor',d-30,100,100,'verified','standalone',false,now());
 perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(jsonb_build_object('rowKey',scope||'anchor','hotel','KAT','accountNo','SYNTH-ACCOUNT','invoiceNo','anchor','folio','F-anchor','locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null))));
 foreach kind in array array['send','draft','unconfirmed','test','no-history','wrong-stage','other-invoice','uncorroborated'] loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,kind,kind,'F-'||kind,d-30,100,100,'verified','standalone',false,now());
  row:=jsonb_build_object('rowKey',scope||kind,'hotel','KAT','accountNo','SYNTH-ACCOUNT','invoiceNo',kind,'folio','F-'||kind,'locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'U',null,'V',null,'W',null));
  perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(row));
  delivery:=gen_random_uuid();proof_invoice:=case kind when 'other-invoice' then 'anchor' else kind end;proof_field:=case kind when 'wrong-stage' then 'V' else 'U' end;sent_day:=case kind when 'uncorroborated' then d-1 else d end;
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at,created_at) values(delivery,actor,case kind when 'draft' then 'draft' when 'unconfirmed' then 'draft' when 'test' then 'test' else 'send' end,'synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}',case kind when 'unconfirmed' then 'awaiting_evidence' else 'sent' end,'synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'),(d::timestamp at time zone 'Asia/Bangkok')-interval '2 days');
  if kind<>'unconfirmed' then
   insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array[proof_invoice],'collection',case kind when 'wrong-stage' then 'Follow 2' else 'Follow 1' end,(sent_day::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
  end if;
  if kind in('send','draft','wrong-stage','other-invoice','uncorroborated') then
   select id into strict q from ar_private.tracker_outbox where delivery_id=delivery and invoice_id=proof_invoice and field=proof_field;
   if kind='uncorroborated' then
    rejected:=false;
    select count(*) into before_bad from ar_private.tracker_history where delivery_id=delivery;
    begin perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(d::text),'synthetic-forged-day');
    exception when others then if sqlerrm='tracker_intent_changed' then rejected:=true;else raise;end if;end;
    if not rejected then raise exception 'receipt day not corroborated by frozen Sent intent accepted';end if;
    if (select count(*) from ar_private.tracker_history where delivery_id=delivery)<>before_bad or (select state from ar_private.tracker_outbox where id=q)<>'pending' then raise exception 'rejected receipt published history or changed intent';end if;
   end if;
   perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(sent_day::text),'synthetic-exact-readback');
   if not exists(select 1 from ar_private.tracker_history where delivery_id=delivery and invoice_id=proof_invoice and field=proof_field and actual_date=sent_day and source='confirmed_sent_writeback') then raise exception 'negative control lacks a genuine canonical receipt';end if;
  end if;
  expected:=kind in('send','draft');
  observed:=ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||kind,'KAT',scope,kind,'U',d-1);
  if observed is distinct from expected then raise exception 'confirmed receipt proof control failed: %',kind;end if;
  if kind='unconfirmed' and exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery) then raise exception 'unconfirmed Draft created billing writeback';end if;
 end loop;
 if current_setting('plan_cache_mode') is distinct from cache_mode then raise exception 'provenance helper leaked planning setting';end if;
 if ar_private.tracker_confirmed_reminder_reversion(gen_random_uuid(),'phuket',scope||'send','KAT',scope,'send','U',d-1) or ar_private.tracker_confirmed_reminder_reversion(actor,'khao-lak',scope||'send','KAT',scope,'send','U',d-1) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||'send','KAT',scope,'draft','U',d-1) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||'send','KAT',scope,'send','V',d-1) then raise exception 'receipt owner/region/invoice/stage identity broadened';end if;
 if ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||'send','KAT',scope,'send','R',d-1) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||'send','KAT',scope,'send','U',d) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket',scope||'send','KAT',scope,'send','U',null) then raise exception 'R/equal/null historical helper scope broadened';end if;
 if has_function_privilege('anon','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') or has_function_privilege('authenticated','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') or has_function_privilege('service_role','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') then raise exception 'private receipt helper exposed';end if;
 insert into ar_private.tracker_history(region,row_key,field,source,actor,before_value,after_value) select 'phuket',scope||'send','AB','synthetic_nonconfirmed',actor,'null','"synthetic unrelated history"' from generate_series(1,3000);
 analyze ar_private.tracker_history;
 execute 'explain (format json,costs false) select h.delivery_id from ar_private.tracker_history h where h.hotel=$1 and h.account_id=$2 and h.invoice_id=$3 and h.field=$4 and h.source=''confirmed_sent_writeback'' and h.actual_date is not null and h.actual_date>$5 and h.region=$6 and h.row_key=$7' into query_plan using 'KAT',scope,'send','U',d-1,'phuket',scope||'send';
 if query_plan::text not like '%tracker_history_confirmed_reminder_lookup%' then raise exception 'confirmed history lookup lost partial canonical index';end if;
 end $$;
rollback;
