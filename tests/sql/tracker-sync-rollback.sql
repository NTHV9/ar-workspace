begin;
do $$
declare actor uuid;other uuid:=gen_random_uuid();scope text:='SYNTH-TRACKER-'||gen_random_uuid();lock_id uuid:=gen_random_uuid();tracked_key text:='SYNTH-OPAQUE-KEY';result jsonb;rows jsonb;stamp date:=(now() at time zone 'Asia/Bangkok')::date-20;before_events bigint;rev integer;conflict uuid;delivery uuid:=gen_random_uuid();bill_delivery uuid:=gen_random_uuid();event_count bigint;r_baseline jsonb;r_fact jsonb;r_history bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'0002','Synthetic tracker','SYNTHETIC',100,0,1,'verified'),('TSK',scope,'0002','Separate synthetic tracker','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'i','00001','7',stamp-20,100,100,'verified','standalone',false,now()),('TSK',scope,'i','00001','7',stamp-20,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 select count(*) into before_events from public.ar_sent_events;
 result:=public.ar_tracker_connect(actor,'phuket','synthetic_original_tracker_12345',0);if result->>'connected'<>'true' then raise exception 'tracker connect failed: %',result;end if;
 if public.ar_tracker_claim(actor,'phuket',lock_id,true)->>'status'<>'preview_required' then raise exception 'bootstrap started without review';end if;
 rows:=jsonb_build_array(jsonb_build_object('rowKey',tracked_key,'hotel','KAT','accountNo','0002','invoiceNo','00001','folio','7','locator',jsonb_build_object('tab','KT','row',3),'fields',jsonb_build_object('R',stamp::text,'S','30.0','T',(stamp+30)::text,'U',(stamp+1)::text,'V',(stamp+1)::text,'W',null,'X',(stamp+10)::text,'Y','Promised payment','Z','10','AA',null,'AB','Synthetic note','AC','Sheet owner')));
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_original_tracker_12345','synthetic-v1',repeat('a',64),rows);
 if (result->>'eligibleFields')::int<1 or exists(select 1 from ar_private.tracker_history where region='phuket') then raise exception 'preview mutated business data';end if;
 if exists(select 1 from jsonb_array_elements(result->'details') d where d->>'field'='S' and d->>'decision'='reference_difference') then raise exception 'equal float-encoded credit term became preview difference';end if;
 conflict:=(result->>'previewId')::uuid;
 if public.ar_tracker_confirm_preview(actor,'phuket',conflict,repeat('b',64),'synthetic-v1')->>'error'<>'tracker_preview_changed' then raise exception 'unreviewed snapshot accepted';end if;
 result:=public.ar_tracker_confirm_preview(actor,'phuket',conflict,repeat('a',64),'synthetic-v1');if result->>'imported'<>'1' or result->>'confirmed'<>'true' then raise exception 'tracker reviewed import failed: %',result;end if;
 if public.ar_tracker_confirm_preview(actor,'phuket',conflict,repeat('a',64),'synthetic-v1')->>'replayed'<>'true' then raise exception 'preview retry lost receipt';end if;
 result:=public.ar_tracker_claim(actor,'phuket',lock_id,true);if result->>'status'<>'claimed' then raise exception 'tracker lock failed';end if;
 if public.ar_tracker_claim(actor,'phuket',gen_random_uuid(),true)->>'status'<>'busy' then raise exception 'duplicate tab lease accepted';end if;
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='S' and status='pending') then raise exception 'equal float-encoded term became a conflict';end if;
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp then raise exception 'first actual billing missing';end if;
 if (select credit_term from public.ar_account_settings where hotel='KAT' and account_id=scope)<>30 or (select open from public.ar_invoices where hotel='KAT' and account_id=scope and id='i')<>100 then raise exception 'tracker altered accounting or account settings';end if;
 if (select first_billing_date from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and invoice_id='i') is not null then raise exception 'cross hotel tracker match';end if;
 if (select count(*) from public.ar_sent_events)<>before_events then raise exception 'sheet import fabricated Gmail';end if;
 if not exists(select 1 from ar_private.tracker_history where region='phuket' and row_key=tracked_key and field='U' and actual_date=stamp+1 and hotel='KAT' and account_id=scope and invoice_id='i') then raise exception 'sheet provenance missing';end if;
 if (select latest_stage from ar_private.dashboard_current_invoices where hotel='KAT' and account_id=scope and invoice_id='i')<>'Follow 2' then raise exception 'effective dashboard stage missing';end if;
 if (select last_reminder_stage from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>'Follow 2' then raise exception 'same-day stages disagree between Register and Dashboard';end if;
 rows:=jsonb_set(rows,'{0,fields,V}','null');perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='V' and status='pending';
 result:=public.ar_tracker_resolve(actor,'phuket',conflict,rev,'accept_sheet');if result->>'resolved'<>'true' then raise exception 'sheet retraction failed: %',result;end if;
 if (select last_reminder_stage from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>'Follow 1' or (select latest_stage from ar_private.dashboard_current_invoices where hotel='KAT' and account_id=scope and invoice_id='i')<>'Follow 1' then raise exception 'reviewed retraction left stale stage';end if;
 rows:=jsonb_set(rows,'{0,fields,U}',to_jsonb((stamp-2)::text));perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 if (select last_reminder_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-2 then raise exception 'earlier accepted correction left stale reminder date';end if;
 rows:=jsonb_set(rows,'{0,fields,AC}','null');perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='AC' and status='pending';
 result:=public.ar_tracker_resolve(actor,'phuket',conflict,rev,'accept_sheet');if result->>'resolved'<>'true' or (select owner_name from ar_private.invoice_tracking where hotel='KAT' and account_id=scope and invoice_id='i')<>'' then raise exception 'reviewed blank owner failed: %',result;end if;
 -- Unknown Sheet status remains a read-only reported fact; a bad W does not
 -- prevent safe changes to other fields on the same strongly identified row.
 rows:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(rows,'{0,fields,Y}','"ติดตามชำระ"'),'{0,fields,W}','"5/10"'),'{0,fieldHolds}','["W"]'),'{0,fields,X}',to_jsonb((stamp+11)::text));
 result:=public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);if result->>'imported'<>'1' then raise exception 'bad field blocked valid independent import: %',result;end if;
 result:=public.ar_invoice_register_get(actor,'KAT',scope,'i');
 if result->>'sourceTrackingStatusRaw'<>'ติดตามชำระ' or result->>'tracking_status'<>'Promised payment' or result->>'promised_date'<>(stamp+11)::text then raise exception 'reported raw status or canonical authority lost';end if;
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='Y' and status='pending') then raise exception 'unknown reported status became a permanent mapping gate';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='W' and reason='invalid_source_field' and status='pending') then raise exception 'unsupported reminder date was not held';end if;
 result:=public.ar_invoice_register_history(actor,'KAT',scope,'i');if not exists(select 1 from jsonb_array_elements(result->'rows') h where h->>'sourceTrackingStatusAfter'='ติดตามชำระ' and h->>'source'='sheet_reported_status' and h->>'actor' like '%editor unavailable%') then raise exception 'raw source status provenance missing from Register history';end if;
 rows:=jsonb_set(jsonb_set(jsonb_set(rows,'{0,fields,Y}','null'),'{0,fields,W}','null'),'{0,fieldHolds}','[]');perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 result:=public.ar_invoice_register_get(actor,'KAT',scope,'i');if result->>'sourceTrackingStatusRaw' is not null or result->>'tracking_status'<>'Promised payment' then raise exception 'source clearing erased canonical status';end if;
 select revision into rev from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i';
 result:=public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);if result->>'imported'<>'0' or (select revision from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>rev then raise exception 'sheet echo duplicated workflow';end if;
 -- Row movement changes locator only; key identity remains stable.
 result:=public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,locator,row}','30'));
 if (select count(*) from ar_private.tracker_rows where region='phuket' and row_key=tracked_key)<>1 then raise exception 'row move duplicated key';end if;
 result:=public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(jsonb_set(rows,'{0,rowKey}','"SYNTH-INTERNAL-ID-COLLISION"'),'{0,accountNo}',to_jsonb(scope)));
 if exists(select 1 from ar_private.tracker_rows where region='phuket' and row_key='SYNTH-INTERNAL-ID-COLLISION' and invoice_id is not null) then raise exception 'internal id bypassed known Account No mismatch';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,S}','"45"'));
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='S' and status='pending';
 perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'keep_web');
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,S}','"45"'));
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='S' and status='pending') then raise exception 'acknowledged reference difference reopened unchanged';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,S}','"30 days"'));
 if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='S' and reason='invalid_source_field' and status='pending') then raise exception 'nonnumeric credit reference was not held safely';end if;
 if (select credit_term from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>30 then raise exception 'invalid credit reference changed account authority';end if;
 -- A manual web edit and a different Sheet edit must remain a visible conflict.
 update public.ar_invoice_workflow set first_billing_date=stamp-1,revision=revision+1 where hotel='KAT' and account_id=scope and invoice_id='i';
 result:=public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-2)::text)));
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-1 then raise exception 'sheet overwrote web correction';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') then raise exception 'manual conflict not surfaced';end if;
 perform public.ar_tracker_membership(actor,'phuket',lock_id,'[]');
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-1 or (select count(*) from public.ar_sent_events)<>before_events then raise exception 'source deletion erased facts';end if;
 if exists(select 1 from ar_private.tracker_rows where region='phuket' and row_key=tracked_key and present) then raise exception 'source absence not recorded';end if;
 -- Synthetic transaction ordering: event insert precedes final delivery state.
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(delivery,actor,'send','synthetic-tracker-'||delivery,'{}','awaiting_evidence');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array['i'],'collection','Follow 2',now(),'synthetic-tracker-'||delivery,100);
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and invoice_id='i' and field='V' and state='pending') then raise exception 'Sent insert did not atomically enqueue';end if;
 if jsonb_array_length(public.ar_tracker_outbox(actor,'phuket',lock_id))<>0 then raise exception 'unknown delivery/source absence became writable';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 update ar_private.mail_deliveries set state='sent' where id=delivery;
 if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lock_id)) q where q->>'field'='V') then raise exception 'committed confirmed Sent outbox missing';end if;
 -- R is the established first actual billing date, never this resend day.
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending';
 perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'keep_web');
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(bill_delivery,actor,'send','synthetic-tracker-'||bill_delivery,'{}','awaiting_evidence');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(bill_delivery,actor,'KAT',scope,array['i'],'billing',null,((stamp-3)::timestamp at time zone 'Asia/Bangkok'),'synthetic-tracker-'||bill_delivery,100);
 update ar_private.mail_deliveries set state='sent' where id=bill_delivery;
 if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lock_id)) q where q->>'field'='R' and q->>'value'=(stamp-3)::text) then raise exception 'confirmed earliest billing was not preserved';end if;
 if (select count(*) from ar_private.tracker_outbox where delivery_id=bill_delivery)<>1 then raise exception 'outbox duplicated selected invoice';end if;
 perform public.ar_tracker_write_result(actor,'phuket',lock_id,(select id from ar_private.tracker_outbox where delivery_id=bill_delivery),'written',to_jsonb(stamp::text),to_jsonb((stamp-3)::text),'synthetic-written-version');
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-3)::text)));
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') then raise exception 'equal confirmed billing day was not an echo';end if;
 -- External first billing can legitimately precede the first Gmail send.
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-4)::text)));
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-4 or exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') then raise exception 'legitimate pre-email first billing was blocked';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-3)::text)));
 select baseline->'R' into r_baseline from ar_private.tracker_rows where region='phuket' and row_key=tracked_key;
 select value into r_fact from ar_private.tracker_accepted_facts where region='phuket' and row_key=tracked_key and field='R';
 select count(*) into r_history from ar_private.tracker_history where region='phuket' and row_key=tracked_key and field='R';
 -- A later nonblank R must be a visible review case after confirmed billing
 -- and writeback; the floor alone must not hide a silently advanced baseline.
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-2)::text)));
 if not exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') then
  raise exception 'confirmed R later source date silently imported: baseline=%,accepted=%,workflow=%,due=%,outbox=%',
   (select baseline->>'R' from ar_private.tracker_rows where region='phuket' and row_key=tracked_key),
   (select actual_date from ar_private.tracker_accepted_facts where region='phuket' and row_key=tracked_key and field='R'),
   (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i'),
   (select due_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i'),
   (select state from ar_private.tracker_outbox where delivery_id=bill_delivery);
 end if;
 if (select baseline->'R' from ar_private.tracker_rows where region='phuket' and row_key=tracked_key) is distinct from r_baseline or (select value from ar_private.tracker_accepted_facts where region='phuket' and row_key=tracked_key and field='R') is distinct from r_fact or (select count(*) from ar_private.tracker_history where region='phuket' and row_key=tracked_key and field='R')<>r_history or (select state from ar_private.tracker_outbox where delivery_id=bill_delivery)<>'written' then raise exception 'unreviewed later R changed baseline/fact/history/acknowledgment';end if;
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending';perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'keep_web');
 if not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lock_id)) item where item->>'field'='R' and item->>'state'='pending' and item->>'expected'=(stamp-2)::text and item->>'value'=(stamp-3)::text) then raise exception 'Keep AR later billing conflict did not requeue fresh preimage/floor';end if;
 perform public.ar_tracker_write_result(actor,'phuket',lock_id,(select id from ar_private.tracker_outbox where delivery_id=bill_delivery),'written',to_jsonb((stamp-2)::text),to_jsonb((stamp-3)::text),'synthetic-written-r-reviewed');
 if (select expected_value from ar_private.tracker_outbox where delivery_id=bill_delivery) is distinct from to_jsonb((stamp-2)::text) then raise exception 'reviewed R writeback lost fresh Sheet preimage';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp-3)::text)));
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') then raise exception 'reviewed R writeback echo reopened conflict';end if;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,jsonb_set(rows,'{0,fields,R}','null'));
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending';perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'keep_web');
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=bill_delivery and state='pending') then raise exception 'reviewed source reversion did not requeue the written date';end if;
 rows:=jsonb_set(rows,'{0,fields,R}',to_jsonb((stamp+2)::text));perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending';
 perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'accept_sheet');
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-3 or (select due_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp+27 then raise exception 'later Sheet correction moved true first billing or due';end if;
 select count(*) into event_count from public.ar_sent_events;
 perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 if exists(select 1 from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending') or (select count(*) from public.ar_sent_events)<>event_count then raise exception 'reviewed later R acknowledgment reopened or changed Gmail';end if;
 rows:=jsonb_set(rows,'{0,fields,R}','null');perform public.ar_tracker_snapshot(actor,'phuket',lock_id,rows);
 select id,revision into conflict,rev from ar_private.tracker_conflicts where region='phuket' and row_key=tracked_key and field='R' and status='pending';
 perform public.ar_tracker_resolve(actor,'phuket',conflict,rev,'accept_sheet');
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>stamp-3 or not exists(select 1 from jsonb_array_elements(public.ar_tracker_outbox(actor,'phuket',lock_id)) q where q->>'field'='R' and q->>'value'=(stamp-3)::text) then raise exception 'Sheet clear erased immutable first billing or R writeback';end if;
 begin perform public.ar_tracker_status(other,'phuket');raise exception 'unknown actor admitted';exception when others then if sqlerrm<>'tracker_forbidden' then raise;end if;end;
 if has_function_privilege('authenticated','public.ar_tracker_snapshot(uuid,text,uuid,jsonb)','execute') or has_table_privilege('service_role','ar_private.tracker_history','select') then raise exception 'tracker private boundary exposed';end if;
end $$;
rollback;
