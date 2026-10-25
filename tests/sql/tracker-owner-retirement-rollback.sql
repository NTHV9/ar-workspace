-- Synthetic owner review only; no provider calls; all writes roll back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-RETIRE-'||gen_random_uuid();delivery uuid;cmd uuid:=gen_random_uuid();jobs uuid[];job uuid;plan jsonb;result jsonb;baseline jsonb;after_state jsonb;k integer;lease uuid:=gen_random_uuid();before_q jsonb;case_row record;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic retirement','SYNTHETIC',300,0,4,'verified');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_retirement_tracker_12345',0);
 update ar_private.tracker_bindings set enabled=true,bootstrap_confirmed=true,version='v2:"new"',last_success_at=now(),last_error=null,lock_id=null,lock_until=null where region='phuket';
 for k in 1..4 loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
  values('KAT',scope,k::text,'SYNTH-I-'||k,'SYNTH-F-'||k,current_date-30,100,case when k=1 then 0 else 100 end,case when k=1 then 'cleared' else 'verified' end,'standalone',false,now());
  delivery:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,now());
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array[k::text],'collection','Follow 1',now(),'synthetic-'||delivery,100);
  select id into job from ar_private.tracker_outbox where delivery_id=delivery;
  jobs:=array_append(jobs,job);
 end loop;
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values
 ('phuket',scope||'-wrong','KAT',null,null,jsonb_build_object('hotel','KAT','accountNo','OTHER-LEDGER','invoiceNo','SYNTH-I-3','folio','SYNTH-F-3','transactionDate',(current_date-30)::text),'{}','{"U":null}'),
 ('phuket',scope||'-exact','KAT',scope,'4',jsonb_build_object('hotel','KAT','accountNo',scope,'invoiceNo','SYNTH-I-4','folio','SYNTH-F-4','transactionDate',(current_date-30)::text),'{}','{"U":null}');
 insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,after_value) values('phuket',scope||'-exact','U',null,'sheet_actual',actor,'null');
 -- Create cleared Sheet authority without invoking provider or workflow adoption.
 insert into ar_private.tracker_current_dates(hotel,account_id,invoice_id,field,actual_date,region,row_key,history_id,generation)
 select 'KAT',scope,'4','U',null,'phuket',scope||'-exact',max(id),2 from ar_private.tracker_history where row_key=scope||'-exact';
 update ar_private.tracker_outbox set state='uncertain',attempts=1,authority_generation=1,intent_captured=true,provider_version='v2:"old"' where id=jobs[4];
 plan:=public.ar_tracker_retirement_preview(actor,'phuket',jobs);
 if plan->'counts' is distinct from '{"cleared_invoice":1,"quarantine_missing_row":1,"quarantine_identity_mismatch":1,"superseded_sheet_authority":1}'::jsonb then raise exception 'bad dispositions %',plan;end if;
 -- Real publisher semantics: confirmed zero is cleared, never a missing/error response.
 -- Exercise both zero and positive balances with actual supported verification states.
 for case_row in select * from (values
  ('verified',0::numeric,now(),true,'cleared_invoice'),
  ('cleared',0::numeric,now(),true,'cleared_invoice'),
  ('verified',100::numeric,now(),true,'quarantine_missing_row'),
  ('cleared',100::numeric,now(),false,null),
  ('unknown',0::numeric,now(),false,null),('unknown',100::numeric,now(),false,null),
  ('missing',0::numeric,now(),false,null),('missing',100::numeric,now(),false,null),
  ('verified',0::numeric,now()-interval '16 minutes',false,null),
  ('verified',100::numeric,now()-interval '16 minutes',false,null),
  ('cleared',0::numeric,now()-interval '16 minutes',false,null),
  ('cleared',100::numeric,now()-interval '16 minutes',false,null),
  ('unknown',0::numeric,null::timestamptz,false,null)
 ) cases(verification,balance,observed,eligible,disposition) loop
  begin
   update public.ar_invoices set verification_state=case_row.verification,open=case_row.balance,synced_at=case_row.observed where account_id=scope and id='1';
   begin
    result:=public.ar_tracker_retirement_preview(actor,'phuket',array[jobs[1]]);
    if not case_row.eligible then raise exception 'unsafe financial evidence accepted: %',row_to_json(case_row);end if;
    if result->'items'->0->>'disposition' is distinct from case_row.disposition then raise exception 'wrong financial disposition: %',case_row;end if;
   exception when others then
    if case_row.eligible or sqlerrm<>'tracker_retirement_ineligible' then raise;end if;
   end;
   raise exception 'rollback_financial_case';
  exception when others then if sqlerrm<>'rollback_financial_case' then raise;end if;end;
 end loop;
 -- Hash ignores advancing health timestamps.
 update ar_private.tracker_bindings set last_success_at=clock_timestamp() where region='phuket';
 if public.ar_tracker_retirement_preview(actor,'phuket',jobs)->>'hash'<>plan->>'hash' then raise exception 'health timestamp perturbed hash';end if;
 begin perform public.ar_tracker_retirement_preview(gen_random_uuid(),'phuket',jobs);raise exception 'owner accepted';exception when others then if sqlerrm='owner accepted' then raise;end if;end;
 begin perform public.ar_tracker_retirement_preview(actor,'khao-lak',jobs);raise exception 'region accepted';exception when others then if sqlerrm='region accepted' then raise;end if;end;
 begin
  update ar_private.tracker_bindings set lock_id=lease,lock_until=now()+interval '1 minute' where region='phuket';
  perform public.ar_tracker_retirement_apply(actor,'phuket',cmd,jobs,plan->>'hash');raise exception 'lease accepted';
 exception when others then if sqlerrm<>'tracker_retirement_busy' then raise;end if;end;
 begin
  update ar_private.tracker_outbox set updated_at=clock_timestamp() where id=jobs[1];
  perform public.ar_tracker_retirement_apply(actor,'phuket',cmd,jobs,plan->>'hash');raise exception 'stale accepted';
 exception when others then if sqlerrm<>'tracker_retirement_preview_stale' then raise;end if;end;
 begin
  update public.ar_invoices set verification_state='missing' where account_id=scope and id='1';
  perform public.ar_tracker_retirement_preview(actor,'phuket',jobs);raise exception 'unverified zero accepted';
 exception when others then if sqlerrm<>'tracker_retirement_ineligible' then raise;end if;end;
  begin
  update ar_private.tracker_bindings set last_success_at=now()-interval '16 minutes' where region='phuket';
  perform public.ar_tracker_retirement_preview(actor,'phuket',jobs);raise exception 'stale health accepted';
 exception when others then if sqlerrm<>'tracker_retirement_source_stale' then raise;end if;end;
 begin
  update ar_private.tracker_rows set sheet_values=jsonb_build_object('U',current_date::text) where row_key=scope||'-exact';
  update ar_private.tracker_current_dates set actual_date=current_date where account_id=scope;
  result:=public.ar_tracker_retirement_preview(actor,'phuket',jobs);
  perform public.ar_tracker_retirement_apply(actor,'phuket',gen_random_uuid(),jobs,result->>'hash');
  if (select actual_date from ar_private.tracker_current_dates where account_id=scope) is distinct from current_date or (select sheet_values->>'U' from ar_private.tracker_rows where row_key=scope||'-exact')<>current_date::text then raise exception 'edited date overwritten';end if;
  raise exception 'rollback_edited_case';
 exception when others then if sqlerrm<>'rollback_edited_case' then raise;end if;end;
select jsonb_build_object('invoices',(select jsonb_agg(to_jsonb(i)) from public.ar_invoices i where account_id=scope),'workflow',(select jsonb_agg(to_jsonb(w)) from public.ar_invoice_workflow w where account_id=scope),'dates',(select jsonb_agg(to_jsonb(c)) from ar_private.tracker_current_dates c where account_id=scope),'rows',(select jsonb_agg(to_jsonb(r)) from ar_private.tracker_rows r where row_key like scope||'%'),'sent',(select jsonb_agg(to_jsonb(e)) from public.ar_sent_events e where account_id=scope),'delivery',(select jsonb_agg(to_jsonb(m)) from ar_private.mail_deliveries m join public.ar_sent_events e on m.id=e.delivery_id where e.account_id=scope)) into baseline;
 select jsonb_agg(to_jsonb(q)-'state'-'updated_at' order by q.id) into before_q from ar_private.tracker_outbox q where id=any(jobs);
 result:=public.ar_tracker_retirement_apply(actor,'phuket',cmd,jobs,plan->>'hash');
 if result is distinct from public.ar_tracker_retirement_apply(actor,'phuket',cmd,jobs,plan->>'hash') then raise exception 'replay changed';end if;
 if exists(select 1 from ar_private.tracker_outbox where id=any(jobs) and state<>'suppressed') then raise exception 'not terminal';end if;
 if before_q is distinct from (select jsonb_agg(to_jsonb(q)-'state'-'updated_at' order by q.id) from ar_private.tracker_outbox q where id=any(jobs)) then raise exception 'intent changed';end if;
 select jsonb_build_object('invoices',(select jsonb_agg(to_jsonb(i)) from public.ar_invoices i where account_id=scope),'workflow',(select jsonb_agg(to_jsonb(w)) from public.ar_invoice_workflow w where account_id=scope),'dates',(select jsonb_agg(to_jsonb(c)) from ar_private.tracker_current_dates c where account_id=scope),'rows',(select jsonb_agg(to_jsonb(r)) from ar_private.tracker_rows r where row_key like scope||'%'),'sent',(select jsonb_agg(to_jsonb(e)) from public.ar_sent_events e where account_id=scope),'delivery',(select jsonb_agg(to_jsonb(m)) from ar_private.mail_deliveries m join public.ar_sent_events e on m.id=e.delivery_id where e.account_id=scope)) into after_state;
 if baseline is distinct from after_state then raise exception 'financial/workflow/Sheet/Sent/delivery changed';end if;
 if (public.ar_tracker_status(actor,'phuket')->>'quarantinedWrites')::integer<>2 then raise exception 'missing quarantine projection';end if;
 if exists(select 1 from jsonb_array_elements(public.ar_tracker_status(actor,'phuket')->'quarantinedRows') x where x->>'reason' not in('missing_sheet_row','sheet_account_mismatch') or x?'evidence') then raise exception 'unsafe status';end if;
 begin perform public.ar_tracker_retirement_apply(actor,'phuket',cmd,jobs,repeat('0',64));raise exception 'mismatch accepted';exception when others then if sqlerrm<>'tracker_retirement_command_conflict' then raise;end if;end;
 begin update ar_private.tracker_retirement_commands set plan='{}' where command_id=cmd;raise exception 'receipt mutable';exception when others then if sqlerrm<>'tracker_retirement_immutable' then raise;end if;end;
 -- A reviewed exact source binding can remove the visible quarantine, without retrying the retired command.
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values
 ('phuket',scope||'-resolved','KAT',scope,'2',jsonb_build_object('hotel','KAT','accountNo',scope,'invoiceNo','SYNTH-I-2','folio','SYNTH-F-2','transactionDate',(current_date-30)::text),'{}','{"U":null}');
 insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,after_value) values('phuket',scope||'-resolved','U',null,'sheet_actual',actor,'null');
 insert into ar_private.tracker_current_dates(hotel,account_id,invoice_id,field,actual_date,region,row_key,history_id,generation)
 select 'KAT',scope,'2','U',null,'phuket',scope||'-resolved',max(id),1 from ar_private.tracker_history where row_key=scope||'-resolved';
 if (public.ar_tracker_status(actor,'phuket')->>'quarantinedWrites')::integer<>1 or (select state from ar_private.tracker_outbox where id=jobs[2])<>'suppressed' then raise exception 'reviewed source binding resumed old write or failed quarantine resolution';end if;
 update ar_private.tracker_bindings set lock_id=lease,lock_until=now()+interval '1 minute' where region='phuket';
 if public.ar_tracker_write_result(actor,'phuket',lease,jobs[4],'written','null','null','v2:"new"')->>'state'<>'suppressed' then raise exception 'late write revived';end if;
end $$;
rollback;
