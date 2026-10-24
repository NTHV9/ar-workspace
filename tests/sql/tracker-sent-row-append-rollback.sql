-- Synthetic actual-Sent-only admission. No provider requests; all changes roll back.
begin;
create function pg_temp.append_plan(c jsonb) returns jsonb language plpgsql as $$
declare s jsonb:=c->'sourceRow';v jsonb;k text;formula text;
begin
 k:='KT|Synthetic Agent|I:'||(case when s->>'invoiceNo'~'^[0-9]+$' then coalesce(nullif(ltrim(s->>'invoiceNo','0'),''),'0') else s->>'invoiceNo' end)||'|1';
 formula:='=IF(AND(ISNUMBER(INDEX(R:R,ROW())),ISNUMBER(INDEX(S:S,ROW()))),INDEX(R:R,ROW())+INDEX(S:S,ROW()),"")';
 v:=jsonb_build_array('KT','Synthetic Agent',s->'accountNo',s->'guest',s->'invoiceNo',s->'folio',s->'transactionDate',100,
  100,0,0,0,0,0,10,'0-30','🟢 ปกติ',c->'desiredDates'->'R',30,jsonb_build_object('formula',formula),c->'desiredDates'->'U',c->'desiredDates'->'V',c->'desiredDates'->'W',
  null,null,null,null,null,null,s->'businessDate',s->'businessDate','ใหม่วันนี้',k);
 return jsonb_build_object('rowKey',k,'agent','Synthetic Agent','metadataId',ar_private.tracker_append_metadata(k),'providerVersion','synthetic-v1','values',v);
end $$;
do $$
declare actor uuid;regional uuid:=gen_random_uuid();scope text:='SYNTH-APPEND-'||gen_random_uuid();p timestamptz:=now()-interval '1 hour';d date:=current_date;
 schema jsonb;lease uuid:=gen_random_uuid();delivery uuid;qids uuid[]:='{}';evs uuid[]:='{}';q uuid;c jsonb;res jsonb;plan jsonb;job jsonb;receipt jsonb;
 fresh jsonb;bad jsonb;h bigint;cmd uuid:=gen_random_uuid();review jsonb;cutoff timestamptz;before_history bigint;before_mail bigint;n integer;first_page jsonb;second_page jsonb;ready_id uuid;fair_id uuid;k text;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 schema:='[{"label":"Up to30","start":0,"end":30,"sequence":1,"amount":500,"debit":500,"credit":0},{"label":"31-60","start":31,"end":60,"sequence":2,"amount":0,"debit":0,"credit":0},{"label":"61-90","start":61,"end":90,"sequence":3,"amount":0,"debit":0,"credit":0},{"label":"91-120","start":91,"end":120,"sequence":4,"amount":0,"debit":0,"credit":0},{"label":"121-150","start":121,"end":150,"sequence":5,"amount":0,"debit":0,"credit":0},{"label":"151+","start":151,"end":null,"sequence":6,"amount":0,"debit":0,"credit":0}]';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,currency,business_date,verification_state,synced_at,"agingBuckets")
 values('KAT',scope,'SYNTH-NO','Synthetic append','SYNTHETIC',500,0,5,'THB',d,'verified',p,schema);
 update public.ar_refresh_state set last_success_at=p where hotel='KAT';
 perform public.ar_tracker_connect(actor,'phuket','synthetic_append_tracker_123456',0);
 update ar_private.tracker_bindings set enabled=true,bootstrap_confirmed=true,version='synthetic-v1',last_success_at=now(),last_error=null,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 for n in 1..5 loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
  values('KAT',scope,n::text,'SYNTH-I-'||n,'SYNTH-F-'||n,d-10,100,100,10,'verified','standalone',false,p);
  update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope and invoice_id=n::text;
  delivery:=gen_random_uuid();evs:=array_append(evs,delivery);
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
  values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,p);
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
  values(delivery,actor,'KAT',scope,array[n::text],case when n=5 then 'collection' else 'billing' end,case when n=5 then 'Friendly' end,p,'synthetic-'||delivery,100);
  if n<>5 then select id into q from ar_private.tracker_outbox where delivery_id=delivery;qids:=array_append(qids,q);end if;
 end loop;
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if res->>'enabled'<>'false' or res->>'total'<>'0' then raise exception 'append enabled by default';end if;
 res:=public.ar_tracker_append_policy_set(actor,'phuket',true);cutoff:=(res->>'admitted_at')::timestamptz;
 perform public.ar_tracker_append_policy_set(actor,'phuket',false);perform public.ar_tracker_append_policy_set(actor,'phuket',true);
 if (select admitted_at from ar_private.tracker_append_policy where region='phuket')<>cutoff then raise exception 'cutoff reset or historical backfill admitted';end if;
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if res->>'total'<>'4' or exists(select 1 from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='5') then raise exception 'classic admission or unmapped historical cutoff failed';end if;
 res:=public.ar_tracker_status(actor,'phuket');
 if res->>'pendingRowAdds'<>'4' or res->>'uncertainRowAdds'<>'0' or res->>'heldRowAdds'<>'0' or jsonb_array_length(res->'rowAddRows')<>4 then raise exception 'unprepared actual Sent waiting rows invisible';end if;
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 select x into c from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='1';
 if c->'sourceRow'->>'open'<>'100.00' or c->'sourceRow'->'aging'<>'["100.00","0.00","0.00","0.00","0.00","0.00"]'::jsonb or c->'desiredDates'->>'R'<>(p at time zone 'Asia/Bangkok')::date::text then raise exception 'financial or immutable Sent date source incorrect';end if;
 fresh:=jsonb_build_array(jsonb_build_object('hotel','KAT','property','KT','agent','Synthetic Agent','accountNo','SYNTH-NO','invoiceNo','OTHER','folio','OTHER','transactionDate',d,'rowKey','KT|Synthetic Agent|I:OTHER|1'));
 plan:=pg_temp.append_plan(c);
 begin perform public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,jsonb_set(plan,'{values,17}','"2099-01-01"'),c->>'sourceHash',fresh);raise exception 'forged date admitted';
 exception when others then if sqlerrm<>'tracker_append_plan_conflict' then raise;end if;end;
 begin perform public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,jsonb_set(plan,'{values,7}','99'),c->>'sourceHash',fresh);raise exception 'forged financial value admitted';
 exception when others then if sqlerrm<>'tracker_append_plan_conflict' then raise;end if;end;
 begin perform public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash','[]');raise exception 'missing alias guessed';
 exception when others then if sqlerrm<>'tracker_append_alias_unverified' then raise;end if;end;
 bad:=fresh||jsonb_build_array(jsonb_build_object('hotel','KAT','property','KT','agent','Different Agent','accountNo','SYNTH-NO'));
 begin perform public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash',bad);raise exception 'ambiguous alias guessed';
 exception when others then if sqlerrm<>'tracker_append_alias_unverified' then raise;end if;end;
 bad:=fresh||jsonb_build_array(jsonb_build_object('hotel','KAT','accountNo','SYNTH-NO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10,'fields','{"R":null}'::jsonb));
 begin perform public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash',bad);raise exception 'existing blank row appended';
 exception when others then if sqlerrm<>'tracker_append_existing_row' then raise;end if;end;
 -- Same invoice number on an explicitly different account is not this ledger.
 -- Preserve its old Sheet row and staff dates while admitting the current one.
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,currency,business_date,verification_state,synced_at,"agingBuckets")
 values('KAT',scope||'-OLD-GO','OTHER-GO','Synthetic old positive GO','SYNTHETIC',100,0,1,'THB',d,'verified',p,jsonb_set(jsonb_set(schema,'{0,amount}','100'),'{0,debit}','100')),
 ('KAT',scope||'-CLEARED-GO','CLEARED-GO','Synthetic old cleared GO','SYNTHETIC',0,0,0,'THB',d,'verified',p,jsonb_set(jsonb_set(schema,'{0,amount}','0'),'{0,debit}','0'));
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope||'-OLD-GO','1','SYNTH-I-1','SYNTH-F-1',d-10,100,100,10,'verified','standalone',false,p),
 ('KAT',scope||'-CLEARED-GO','1','SYNTH-I-1','SYNTH-F-1',d-10,100,0,10,'cleared','standalone',false,p);
 fresh:=fresh||jsonb_build_array(jsonb_build_object('hotel','KAT','property','KT','agent','Old GO Agent','accountNo','OTHER-GO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10,'rowKey','KT|Old GO Agent|I:SYNTH-I-1|1','fields','{"R":"2026-01-01"}'::jsonb));
 fresh:=fresh||jsonb_build_array(jsonb_build_object('hotel','KAT','property','KT','agent','Cleared GO Agent','accountNo','CLEARED-GO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10,'rowKey','KT|Cleared GO Agent|I:SYNTH-I-1|1','fields','{"R":"2026-02-01"}'::jsonb));
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
 values('phuket','KT|Old GO Agent|I:SYNTH-I-1|1','KAT',scope||'-OLD-GO','1',jsonb_build_object('hotel','KAT','accountNo','OTHER-GO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10),'{}','{"R":"2026-01-01"}');
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
 values('phuket','KT|Cleared GO Agent|I:SYNTH-I-1|1','KAT',scope||'-CLEARED-GO','1',jsonb_build_object('hotel','KAT','accountNo','CLEARED-GO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10),'{}','{"R":"2026-02-01"}');
 job:=public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);
 if job->>'state'<>'pending' or job->>'accountId'<>scope or job->'plan'->'values'<>plan->'values' then raise exception 'frozen journal incorrect';end if;
 res:=public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);
 if res->>'id'<>job->>'id' or (select count(*) from ar_private.tracker_sent_row_jobs)<>1 then raise exception 'prepare duplicated command';end if;
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
 values('phuket',plan->>'rowKey','KAT',scope,'1',jsonb_build_object('hotel','KAT','accountNo','SYNTH-NO','invoiceNo','SYNTH-I-1','folio','SYNTH-F-1','transactionDate',d-10),'{}','{"R":null}');
 res:=public.ar_tracker_outbox(actor,'phuket',lease);
 if exists(select 1 from jsonb_array_elements(res)x where x->>'id'=qids[1]::text) then raise exception 'append-covered classic queue emitted a date write';end if;
 delete from ar_private.tracker_rows where region='phuket' and row_key=plan->>'rowKey';
 begin update ar_private.tracker_sent_row_jobs set plan='{}' where id=(job->>'id')::uuid;raise exception 'frozen plan mutated';
 exception when others then if sqlerrm<>'tracker_append_immutable' then raise;end if;end;
 before_history:=(select count(*) from ar_private.tracker_history);before_mail:=(select count(*) from ar_private.mail_deliveries);
 -- A new successful observation with identical business facts keeps the
 -- frozen intent; return current freshness separately from the frozen plan.
 update public.ar_accounts set synced_at=p+interval '30 minutes' where hotel='KAT' and id=scope;
 update public.ar_invoices set synced_at=p+interval '30 minutes' where hotel='KAT' and account_id=scope;
 update public.ar_refresh_state set last_success_at=p+interval '30 minutes' where hotel='KAT';
 res:=public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 if res->>'state'<>'writing' or res->>'attempts'<>'1' or res->'sourceRow' is distinct from job->'sourceRow'
  or res->>'accountId'<>scope or res->>'invoiceNo'<>'SYNTH-I-1' or res->>'folio'<>'SYNTH-F-1'
  or res->>'planHash'<>job->>'planHash' or res->>'sourceHash'<>job->>'sourceHash'
  or (res->>'currentSourceAt')::timestamptz<>p+interval '30 minutes' or (res->'sourceRow'->>'sourceAt')::timestamptz<>p then raise exception 'identical refresh changed frozen intent or lost current freshness';end if;
 receipt:=jsonb_build_object('planHash',job->>'planHash','metadataId',job->'metadataId','rowKey',plan->>'rowKey','providerVersion','synthetic-v2','mutationStarted',false);
 res:=public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt);
 if res->>'state'<>'pending' or res->>'attempts'<>'1' then raise exception 'safe preflight retry lost attempt';end if;
 perform public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 res:=public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt||'{"mutationStarted":true,"rejectedStatus":429}'::jsonb);
 if res->>'state'<>'pending' then raise exception 'definitive 429 rejection could not retry';end if;
 perform public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 res:=public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt||'{"mutationStarted":true,"rejectedStatus":412}'::jsonb);
 if res->>'state'<>'pending' then raise exception 'definitive XLSX precondition rejection could not retry';end if;
 perform public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 begin perform public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt||'{"mutationStarted":true}'::jsonb);raise exception 'unknown mutation without status blindly retried';
 exception when others then if sqlerrm<>'tracker_append_retry_unsafe' then raise;end if;end;
 begin perform public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt||'{"mutationStarted":true,"rejectedStatus":503}'::jsonb);raise exception 'unknown mutation blindly retried';
 exception when others then if sqlerrm<>'tracker_append_retry_unsafe' then raise;end if;end;
 res:=public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'uncertain',receipt||'{"mutationStarted":true}'::jsonb);
 res:=public.ar_tracker_status(actor,'phuket');if res->>'uncertainRowAdds'<>'1' then raise exception 'unknown row append invisible';end if;
 res:=public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 if res->>'state'<>'uncertain' or res->>'readbackOnly'<>'true' or res->>'attempts'<>'4' or res->'sourceRow' is distinct from job->'sourceRow' or res->>'invoiceNo'<>'SYNTH-I-1' then raise exception 'unknown POST admitted another mutation or lost source';end if;
 begin perform public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'pending',receipt);raise exception 'unknown receipt reset to pending';
 exception when others then if sqlerrm<>'tracker_append_retry_unsafe' then raise;end if;end;
 res:=public.ar_tracker_append_finish(actor,'phuket',lease,(job->>'id')::uuid,'written',receipt||'{"mutationStarted":true,"matches":true}'::jsonb);
 if res->>'state'<>'written' or (select state from ar_private.tracker_outbox where id=qids[1])<>'suppressed'
  or (select count(*) from ar_private.tracker_history)<>before_history or (select count(*) from ar_private.mail_deliveries)<>before_mail then raise exception 'append ack changed dates/mail/history';end if;
 if (select sheet_values->>'R' from ar_private.tracker_rows where region='phuket' and row_key='KT|Old GO Agent|I:SYNTH-I-1|1')<>'2026-01-01'
  or (select sheet_values->>'R' from ar_private.tracker_rows where region='phuket' and row_key='KT|Cleared GO Agent|I:SYNTH-I-1|1')<>'2026-02-01' then raise exception 'other account staff dates changed';end if;
 res:=public.ar_tracker_status(actor,'phuket');if res->'rowAddLastSuccessAt'='null'::jsonb or res->>'uncertainRowAdds'<>'0' then raise exception 'row append success status missing';end if;
 -- Explicit historical blank date authority blocks append, even when its
 -- Sheet row was subsequently removed from the current provider snapshot.
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values)
 values('phuket','STAFF-DELETED','KAT',scope,'2',jsonb_build_object('hotel','KAT','accountNo','SYNTH-NO','invoiceNo','SYNTH-I-2','folio','SYNTH-F-2','transactionDate',d-10),'{}','{"R":null}');
 insert into ar_private.tracker_history(region,row_key,field,hotel,account_id,invoice_id,actual_date,source,actor,after_value)
 values('phuket','STAFF-DELETED','R','KAT',scope,'2',null,'sheet_actual',actor,'null') returning id into h;
 insert into ar_private.tracker_current_dates(hotel,account_id,invoice_id,field,actual_date,region,row_key,history_id) values('KAT',scope,'2','R',null,'phuket','STAFF-DELETED',h);
 update ar_private.tracker_rows set present=false where region='phuket' and row_key='STAFF-DELETED';
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if exists(select 1 from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='2') then raise exception 'deleted staff date restored';end if;
 -- Source changes between prepare and begin stop the new-row mutation.
 select x into c from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='3';plan:=pg_temp.append_plan(c);
 job:=public.ar_tracker_append_prepare(actor,'phuket',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);
 update public.ar_invoices set open=90,guest='Source changed' where hotel='KAT' and account_id=scope and id='3';
 update public.ar_accounts set open=490,"agingBuckets"=jsonb_set(jsonb_set(schema,'{0,amount}','490'),'{0,debit}','490') where hotel='KAT' and id=scope;
 res:=public.ar_tracker_append_begin(actor,'phuket',lease,(job->>'id')::uuid,job->>'planHash');
 if res->>'state'<>'hold' or res->>'attempts'<>'0' then raise exception 'source drift began a mutation';end if;
 update public.ar_invoices set open=100 where hotel='KAT' and account_id=scope and id='3';
 update public.ar_accounts set open=500,"agingBuckets"=schema where hotel='KAT' and id=scope;
 -- Only an exact reviewed, previously missing-row quarantine can re-admit a
 -- suppressed old billing intent. No global state reopening is performed.
 update ar_private.tracker_outbox set state='suppressed' where id=qids[4];
 insert into ar_private.tracker_retirement_commands(command_id,actor,region,ids,request_hash,plan,result)
 values(gen_random_uuid(),actor,'phuket',array[qids[4]],repeat('a',64),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',qids[4],'disposition','quarantine_missing_row'))),'{}');
 update ar_private.tracker_bindings set lock_id=null,lock_until=null where region='phuket';
 review:=public.ar_tracker_append_restore_preview(actor,'phuket',array[qids[4]]);
 begin perform public.ar_tracker_append_restore_apply(actor,'phuket',cmd,array[qids[4]],repeat('b',64));raise exception 'stale owner review applied';
 exception when others then if sqlerrm<>'tracker_append_preview_stale' then raise;end if;end;
 perform public.ar_tracker_append_restore_apply(actor,'phuket',cmd,array[qids[4]],review->>'hash');
 perform public.ar_tracker_append_restore_apply(actor,'phuket',cmd,array[qids[4]],review->>'hash');
 if (select state from ar_private.tracker_outbox where id=qids[4])<>'suppressed' or (select count(*) from ar_private.tracker_append_restore_approvals)<>1 then raise exception 'suppressed queue globally reopened';end if;
 update ar_private.tracker_bindings set lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if not exists(select 1 from jsonb_array_elements(res->'jobs')x where x->>'id'=qids[4]::text) then raise exception 'exact owner approval not admitted';end if;
 -- E keeps the exact leading-zero identity, AG follows the existing parser's
 -- arbitrary-precision integer key rule, and metadata is derived from that AG.
 update public.ar_invoices set invoice_no='00001' where hotel='KAT' and account_id=scope and id='4';
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 select x into c from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='4';
 plan:=pg_temp.append_plan(c);ready_id:=(c->>'id')::uuid;
 job:=public.ar_tracker_append_prepare(actor,'phuket',lease,ready_id,plan,c->>'sourceHash',fresh);
 if job->'plan'->'values'->>4<>'00001' or job->>'rowKey'<>'KT|Synthetic Agent|I:1|1' or job->>'invoiceNo'<>'00001'
  or (job->>'metadataId')::integer<>ar_private.tracker_append_metadata('KT|Synthetic Agent|I:1|1') then raise exception 'numeric legacy key drift or leading-zero identity lost';end if;
 -- A genuinely new Friendly (no classic queue) admits one row without making
 -- up a billing date; its historical predecessor alone was never admitted.
 delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
 values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,clock_timestamp());
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
 values(delivery,actor,'KAT',scope,array['5'],'collection','Friendly',clock_timestamp(),'synthetic-'||delivery,100);
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 select x into c from jsonb_array_elements(res->'jobs')x where x->>'invoiceId'='5';
 if c is null or c->'desiredDates'->'R'<>'null'::jsonb or c->>'id'<>md5(delivery::text||'|KAT|'||scope||'|5')::uuid::text then raise exception 'new unmapped actual Sent admission failed';end if;
 -- Delivery receipts, actor scope, lease and table/function ACLs are fences.
 begin update ar_private.mail_deliveries set state='uncertain' where id=delivery;raise exception 'immutable Sent receipt changed';
 exception when others then if sqlerrm<>'sent_evidence_immutable' then raise;end if;end;
 n:=(res->>'total')::integer;delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state)
 values(delivery,actor,'send','synthetic-uncertain-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','awaiting_evidence');
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if (res->>'total')::integer<>n or exists(select 1 from jsonb_array_elements(res->'jobs')x where x->>'id'=md5(delivery::text||'|KAT|'||scope||'|5')::uuid::text) then raise exception 'unconfirmed receipt admitted';end if;
 -- Model a large durable review backlog. Ready jobs keep priority, explicit
 -- paging remains read-only, and the leased cursor visits all >100 identities
 -- rather than repeatedly selecting the same unbuildable/held first ten.
 for n in 1..110 loop
  fair_id:=gen_random_uuid();k:='KT|Synthetic Agent|I:FAIR-'||n||'|1';
  insert into ar_private.tracker_sent_row_jobs(id,command,owner,region,hotel,account_id,invoice_id,source_sent_ids,source_queue_ids,source_hash,expected_legacy_key,metadata_id,plan,plan_hash,state,reason)
  values(fair_id,fair_id,actor,'phuket','KAT',scope,'FAIR-'||lpad(n::text,4,'0'),array[evs[1]],'{}',repeat('a',64),k,1000000+n,
   jsonb_build_object('rowKey',k,'sourceRow',jsonb_build_object('invoiceNo','FAIR-'||n),'desiredDates',jsonb_build_object('R',d)),repeat('b',64),'hold','synthetic_alias_review');
 end loop;
 first_page:=public.ar_tracker_append_candidates(actor,'phuket',lease,0);
 if jsonb_array_length(first_page->'jobs')<>100 or (first_page->>'total')::integer<=110 or first_page->>'nextOffset'<>'100'
  or not exists(select 1 from jsonb_array_elements(first_page->'jobs')x where x->>'id'=ready_id::text)
  or (select scan_offset from ar_private.tracker_append_policy where region='phuket')<>0 then raise exception 'ready work starved or explicit paging mutated cursor';end if;
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease,-1);
 if res->'jobs'<>first_page->'jobs' or res->>'offsetUsed'<>'0' or (select scan_offset from ar_private.tracker_append_policy where region='phuket')<>100 then raise exception 'leased first page cursor failed';end if;
 perform public.ar_tracker_append_candidates(actor,'phuket',lease,0);
 if (select scan_offset from ar_private.tracker_append_policy where region='phuket')<>100 then raise exception 'explicit reread reset fair cursor';end if;
 second_page:=public.ar_tracker_append_candidates(actor,'phuket',lease,-1);
 if second_page->>'offsetUsed'<>'100' or second_page->>'nextOffset'<>'0' or jsonb_array_length(second_page->'jobs')<>((first_page->>'total')::integer-100)
  or exists(select 1 from jsonb_array_elements(first_page->'jobs')a cross join jsonb_array_elements(second_page->'jobs')b where a->>'id'=b->>'id') then raise exception 'later backlog identities unreachable or duplicated';end if;
 res:=public.ar_tracker_append_candidates(actor,'phuket',lease,-1);
 if res->'jobs'<>first_page->'jobs' then raise exception 'cursor wrap changed stable command identities';end if;
 begin perform public.ar_tracker_append_candidates(actor,'phuket',gen_random_uuid());raise exception 'lost lease accepted';
 exception when others then if sqlerrm<>'tracker_lock_lost' then raise;end if;end;
 begin perform public.ar_tracker_append_candidates(actor,'phuket',gen_random_uuid(),-1);raise exception 'lost lease advanced cursor';
 exception when others then if sqlerrm<>'tracker_lock_lost' then raise;end if;end;
 if (select scan_offset from ar_private.tracker_append_policy where region='phuket')<>100 then raise exception 'unauthorized fair scan mutation';end if;
 insert into ar_private.access_members(email,regions,auth_user_id) values('append-regional@example.test',array['khao-lak'],regional);
 insert into auth.users(id,email,email_confirmed_at) values(regional,'append-regional@example.test',now());
 begin perform public.ar_tracker_append_candidates(regional,'phuket',lease);raise exception 'wrong region admitted';
 exception when others then if sqlerrm<>'tracker_forbidden' then raise;end if;end;
 begin perform public.ar_tracker_append_policy_set(regional,'khao-lak',true);raise exception 'nonowner policy enabled';
 exception when others then if sqlerrm<>'tracker_forbidden' then raise;end if;end;
 if has_function_privilege('anon','public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb)','execute')
  or has_function_privilege('authenticated','public.ar_tracker_append_candidates(uuid,text,uuid,integer)','execute')
  or has_table_privilege('service_role','ar_private.tracker_sent_row_jobs','select') then raise exception 'append privilege leak';end if;
end $$;
rollback;
