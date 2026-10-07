-- LOCAL synthetic recovery regression; no provider/cloud/email operation.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-RECOVERY-'||gen_random_uuid();lease uuid:=gen_random_uuid();rows jsonb;held jsonb;r jsonb;preview uuid;reason text;pending bigint;resolved bigint;identity_before jsonb;delivery uuid:=gen_random_uuid();w public.ar_invoice_workflow;denied boolean;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'0002','LOCAL identity recovery','SYNTHETIC',100,0,1,'verified'),('TSK',scope,'0002','LOCAL other hotel','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','00001','F1','2026-09-01',100,100,'verified','standalone',false,now()),('TSK',scope,'A','00001','F1','2026-09-01',100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 rows:=jsonb_build_array(jsonb_build_object('rowKey',scope,'hotel','KAT','accountNo','0002','invoiceNo','00001','folio','F1','transactionDate','2026-09-01','locator','{}'::jsonb,'fields',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null)));
 perform public.ar_tracker_connect(actor,'phuket','LOCAL_identity_recovery_12345',0);r:=public.ar_tracker_preview(actor,'phuket','LOCAL_identity_recovery_12345','v1',repeat('a',64),rows);preview:=(r->>'previewId')::uuid;
 perform public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('a',64),'v1');perform public.ar_tracker_claim(actor,'phuket',lease,true);
 select identity into identity_before from ar_private.tracker_rows where region='phuket' and row_key=scope;
 select * into strict w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A';
 insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,created_at) values(delivery,actor,'send','Follow 1','LOCAL-recovery-'||delivery,jsonb_build_object('draft',jsonb_build_object('hotel','KAT','account_id',scope,'invoice_ids',jsonb_build_array('A'),'purpose','collection'),'workflow',jsonb_build_array(to_jsonb(w)),'manifest',jsonb_build_array(jsonb_build_object('open',100))),'awaiting_evidence','2026-09-01T00:00:00+07');
 r:=public.ar_mail_confirm_sent(actor,delivery,'LOCAL-recovery-'||delivery,'2026-09-01T12:00:00+07');if r->>'recorded' is distinct from 'true' then raise exception 'LOCAL recovery queue fixture failed';end if;
 foreach reason in array array['provider_identity_requires_review','incomplete_identity','ambiguous_or_missing_identity','invoice_source_unverified'] loop
  held:=jsonb_build_array(rows->0||jsonb_build_object('holdReason',reason));perform public.ar_tracker_snapshot(actor,'phuket',lease,held);
  if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=scope and field='identity' and status='pending') then raise exception 'recovery fixture did not hold';end if;
  if exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) q where q->>'deliveryId'=delivery::text) then raise exception 'held identity became writable';end if;
  perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
  if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=scope and field='identity' and status='pending') then raise exception 'verified identity remained held: %',reason;end if;
  if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lease)) q where q->>'deliveryId'=delivery::text and q->>'state'='pending') then raise exception 'recovered identity remained blocked for writeback';end if;
 end loop;
 perform public.ar_tracker_membership(actor,'phuket',lease,'[]');perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=scope and field='identity' and status='pending') then raise exception 'restored source row remained held';end if;
 if (select identity from ar_private.tracker_rows where region='phuket' and row_key=scope) is distinct from identity_before then raise exception 'recovery changed bound identity';end if;
 -- A genuinely absent AR invoice later arrives without changing Sheet identity.
 held:=rows->0||jsonb_build_object('rowKey',scope||'-arrival','invoiceNo','00002','folio','F2');perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(held));
 if not exists(select 1 from ar_private.tracker_conflicts c where c.region='phuket' and c.row_key=scope||'-arrival' and c.reason='ambiguous_or_missing_identity' and c.status='pending') then raise exception 'missing invoice fixture not held';end if;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'B','00002','F2','2026-09-01',100,100,'verified','standalone',false,now());perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(held));
 if exists(select 1 from ar_private.tracker_conflicts c where c.region='phuket' and c.row_key=scope||'-arrival' and c.field='identity' and c.status='pending') or not exists(select 1 from ar_private.tracker_rows where region='phuket' and row_key=scope||'-arrival' and account_id=scope and invoice_id='B') then raise exception 'arriving unique invoice stayed blocked';end if;
 -- Current ambiguity, hold, changed canonical identity and stale preview fences
 -- must never benefit from automatic release.
 foreach reason in array array['ambiguous','provider','hotel','preview'] loop
  insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('phuket',scope,'identity','provider_identity_requires_review');
  held:=case reason when 'ambiguous' then rows->0||jsonb_build_object('ambiguous',true) when 'provider' then rows->0||jsonb_build_object('holdReason','provider_identity_requires_review') when 'hotel' then rows->0||jsonb_build_object('hotel','TSK') else rows->0||jsonb_build_object('reviewFence',jsonb_build_object('workflow',-1,'tracking',-1,'exception',-1)) end;
  perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(held));
  if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=scope and field='identity' and status='pending') then raise exception 'unsafe current identity released: %',reason;end if;
  update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region='phuket' and row_key=scope and field='identity' and status='pending';
 end loop;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('phuket',scope,'identity','unclassified_identity_problem');perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 if not exists(select 1 from ar_private.tracker_conflicts c where c.region='phuket' and c.row_key=scope and c.reason='unclassified_identity_problem' and c.status='pending') then raise exception 'unclassified identity released';end if;
 denied:=false;begin perform public.ar_tracker_snapshot(actor,'phuket',lease,jsonb_build_array(rows->0||jsonb_build_object('hotel','TSAN')));exception when others then if sqlerrm='tracker_invalid' then denied:=true;else raise;end if;end;if not denied then raise exception 'wrong-region snapshot accepted';end if;
 select count(*) into resolved from ar_private.tracker_conflicts where region='phuket' and row_key=scope and status='resolved';if resolved<5 then raise exception 'identity recovery deleted conflict history';end if;
 if (select count(*) from public.ar_sent_events where account_id=scope)<>1 or not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and state='pending') then raise exception 'identity recovery changed Sent or outbox command';end if;
end $$;
rollback;
