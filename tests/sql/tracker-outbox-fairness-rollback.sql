-- Isolated local synthetic queue regression only. All records roll back.
begin;
do $$
declare actor uuid;scope text:='SYNTH-QUEUE-FAIRNESS';delivery uuid:=gen_random_uuid();other_delivery uuid:=gen_random_uuid();lease uuid:=gen_random_uuid();other_lease uuid:=gen_random_uuid();items jsonb;first_ids uuid[];item jsonb;later_pending uuid;later_uncertain uuid;before_events bigint;before_history bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 select count(*) into before_events from public.ar_sent_events;select count(*) into before_history from ar_private.tracker_history;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic queue fairness','SYNTHETIC',10200,0,102,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,'I'||n,'SYN-'||n,'F'||n,current_date-30,100,100,'verified','standalone',false,now() from generate_series(1,102)n;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=current_date-1 where hotel='KAT' and account_id=scope;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_original_queue_fairness_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
 select 'phuket','SYNTH-Q-'||n,'KAT',scope,'I'||n,jsonb_build_object('hotel','KAT','accountNo',scope,'invoiceNo','SYN-'||n,'folio','F'||n),'{}','{"R":null}' from generate_series(1,102)n;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(delivery,actor,'send','synthetic-queue-'||delivery,'{}','awaiting_evidence');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
 values(delivery,actor,'KAT',scope,array(select 'I'||n from generate_series(1,102)n),'billing',null,now(),'synthetic-queue-'||delivery,10200);
 update ar_private.mail_deliveries set state='sent' where id=delivery;
 update ar_private.tracker_outbox set state='held',created_at=now()-interval '3 days',updated_at=now()-interval '3 days' where delivery_id=delivery and substring(invoice_id from 2)::integer<=100;
 update ar_private.tracker_outbox set state=case invoice_id when 'I101' then 'pending' else 'uncertain' end,created_at=now()-interval '2 days',updated_at=now()-interval '2 days' where delivery_id=delivery and invoice_id in('I101','I102');
 select id into later_pending from ar_private.tracker_outbox where delivery_id=delivery and invoice_id='I101';select id into later_uncertain from ar_private.tracker_outbox where delivery_id=delivery and invoice_id='I102';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('TLKL',scope,scope,'Synthetic separate region','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TLKL',scope,'I101','SYN-101','F101',current_date-30,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=current_date-1 where hotel='TLKL' and account_id=scope;
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_original_other_region_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=other_lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('khao-lak','SYNTH-KH-Q','TLKL',scope,'I101',jsonb_build_object('hotel','TLKL','accountNo',scope,'invoiceNo','SYN-101','folio','F101'),'{}','{"R":null}');
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(other_delivery,actor,'send','synthetic-other-queue-'||other_delivery,'{}','awaiting_evidence');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(other_delivery,actor,'TLKL',scope,array['I101'],'billing',null,now(),'synthetic-other-queue-'||other_delivery,100);
 update ar_private.mail_deliveries set state='sent' where id=other_delivery;
 update ar_private.tracker_outbox set state='held',created_at=now()-interval '5 days',updated_at=now()-interval '5 days' where delivery_id=other_delivery;
 if jsonb_array_length(public.ar_tracker_outbox(actor,'khao-lak',other_lease))<>1 or public.ar_tracker_status(actor,'khao-lak')->>'heldWrites'<>'1' or public.ar_tracker_status(actor,'phuket')->>'heldWrites'<>'100' then raise exception 'region-independent held visibility changed';end if;
 items:=public.ar_tracker_outbox(actor,'phuket',lease);if jsonb_array_length(items)<>100 then raise exception 'queue page bound changed';end if;
 if exists(select 1 from jsonb_array_elements(items) x where (x->>'id')::uuid in(later_pending,later_uncertain)) then raise exception 'fixture did not place older held work first';end if;
 select array_agg((x->>'id')::uuid) into first_ids from jsonb_array_elements(items) x;
 for item in select value from jsonb_array_elements(items) loop perform public.ar_tracker_write_result(actor,'phuket',lease,(item->>'id')::uuid,'held',item->'expected',item->'value','synthetic-only-version');end loop;
 -- Local outer rollback shares now(); model distinct production RPC transactions.
 update ar_private.tracker_outbox set updated_at=now()-interval '1 hour' where id=any(first_ids);
 items:=public.ar_tracker_outbox(actor,'phuket',lease);
 if not exists(select 1 from jsonb_array_elements(items)x where (x->>'id')::uuid=later_pending) or not exists(select 1 from jsonb_array_elements(items)x where (x->>'id')::uuid=later_uncertain) then raise exception 'old held queue page starved later pending or uncertain';end if;
 -- Rechecking all candidates rotates them without priority-starving held work.
 for item in select value from jsonb_array_elements(items) loop perform public.ar_tracker_write_result(actor,'phuket',lease,(item->>'id')::uuid,case when (item->>'id')::uuid=later_uncertain then 'uncertain' else 'held' end,item->'expected',item->'value','synthetic-only-version');end loop;
 if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) x where x->>'state'='held') then raise exception 'rotation starved previously held work';end if;
 if exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and id=any(first_ids) and attempts<>0) then raise exception 'technical holds counted publication attempts';end if;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('phuket','SYNTH-Q-101','R','synthetic_requires_review');
 if exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease))x where (x->>'id')::uuid=later_pending) then raise exception 'queue rotation bypassed target field conflict';end if;
 if exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease))x where x->'identity'->>'hotel'='TLKL') then raise exception 'queue rotation crossed hotel region';end if;
 if (select count(*) from ar_private.tracker_history)<>before_history or (select count(*) from public.ar_sent_events)<>before_events+2 then raise exception 'queue checks fabricated publication or additional Sent';end if;
 if has_function_privilege('authenticated','public.ar_tracker_outbox(uuid,text,uuid)','execute') then raise exception 'queue public ACL changed';end if;
end $$;
rollback;