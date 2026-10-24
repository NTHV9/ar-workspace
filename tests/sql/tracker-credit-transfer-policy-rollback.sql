-- Synthetic behavior contract: invoice-local credit, date preservation, transfer and warnings.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-CREDIT-POLICY-'||gen_random_uuid();lease uuid:=gen_random_uuid();r jsonb;s jsonb;jobs jsonb;d date:=(now() at time zone 'Asia/Bangkok')::date-20;job uuid;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('TSAN',scope,'SYNTH-CREDIT-A','Synthetic credit','SYNTHETIC',200,0,2,'verified'),('TSAN',scope||'-moved','SYNTH-CREDIT-B','Synthetic moved','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'i','SYNTH-CREDIT-I','SYNTH-CREDIT-F',d-10,100,100,'verified','standalone',false,now()),('TSAN',scope,'j','SYNTH-CREDIT-J','SYNTH-CREDIT-JF',d-10,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'TSAN',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_settings_save_v2(actor,'TSAN',scope||'-moved',0,true,15,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_credit_policy_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 r:=jsonb_build_object('rowKey',scope,'hotel','TSAN','accountNo','SYNTH-CREDIT-A','invoiceNo','SYNTH-CREDIT-I','folio','SYNTH-CREDIT-F','transactionDate',(d-10)::text,'fields',jsonb_build_object('R',d::text,'S','45','T',(d+2)::text,'U',null,'V',null,'W',null),'locator','{}'::jsonb);
 s:=public.ar_tracker_preview(actor,'khao-lak','synthetic_credit_policy_tracker_12345','synthetic-v1',repeat('a',64),jsonb_build_array(jsonb_set(r,'{fields,R}','null')));
 if exists(select 1 from jsonb_array_elements(s->'details') v where v->>'field' in('S','T') and v->>'decision' in('reference_difference','conflict')) then raise exception 'preview retained independent T or authoritative S conflicts';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='i')<>45 then raise exception 'Sheet credit did not override the selected invoice';end if;
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='j')<>30 then raise exception 'Sheet credit leaked to another invoice';end if;
 if exists(select 1 from ar_private.tracker_conflicts where region='khao-lak' and row_key=scope and field in('S','T') and status='pending') then raise exception 'independent T or adopted S still creates a difference';end if;
 perform public.ar_settings_save_v2(actor,'TSAN',scope,1,true,60,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='i')<>45 or (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='j')<>60 then raise exception 'Account settings overwrote invoice credit override';end if;
 r:=jsonb_set(r,'{fields}',jsonb_build_object('R',null,'S',null,'T',null,'U',null,'V',null,'W',null));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='i')<>60 or (select first_billing_date from public.ar_invoice_workflow where account_id=scope and invoice_id='i') is not null then raise exception 'clear did not restore Account credit and preserve cleared R';end if;
 jobs:=public.ar_tracker_credit_jobs(actor,'khao-lak',lease);
 select (v->>'id')::uuid into strict job from jsonb_array_elements(jobs) v where v->>'rowKey'=scope;
 perform public.ar_tracker_credit_result(actor,'khao-lak',lease,job,'uncertain');
 if (select v->>'state' from jsonb_array_elements(public.ar_tracker_credit_jobs(actor,'khao-lak',lease)) v where v->>'rowKey'=scope)<>'uncertain' then raise exception 'unknown credit write is not readback-only';end if;
 perform public.ar_tracker_credit_result(actor,'khao-lak',lease,job,'written');
 r:=jsonb_set(r,'{fields,S}','"60"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 if exists(select 1 from ar_private.tracker_invoice_credit where account_id=scope and invoice_id='i' and override_term is not null) then raise exception 'auto-fill echo became a manual override';end if;
 -- Returning manually to a historical auto-fill value must remain a manual edit.
 r:=jsonb_set(r,'{fields,S}','"45"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 r:=jsonb_set(r,'{fields,S}','"60"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 perform public.ar_settings_save_v2(actor,'TSAN',scope,2,true,90,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='i')<>60 then raise exception 'historical fill misclassified a later employee edit as an echo';end if;
 -- Employee typing the planned value before a pending fill is still authoritative.
 r:=jsonb_set(r,'{fields,S}','null');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 r:=jsonb_set(r,'{fields,S}','"90"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 perform public.ar_settings_save_v2(actor,'TSAN',scope,3,true,120,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 if (select credit_term from public.ar_invoice_workflow where account_id=scope and invoice_id='i')<>90 then raise exception 'unattempted matching employee input fabricated a fill echo';end if;
 -- Account changes between claim and freeze cancel the stale fill.
 r:=jsonb_set(r,'{fields,S}','null');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 jobs:=public.ar_tracker_credit_jobs(actor,'khao-lak',lease);select (v->>'id')::uuid into strict job from jsonb_array_elements(jobs) v where v->>'rowKey'=scope;
 perform public.ar_settings_save_v2(actor,'TSAN',scope,4,true,150,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 if public.ar_tracker_credit_result(actor,'khao-lak',lease,job,'uncertain')->>'state'<>'cancelled' then raise exception 'stale Account credit authorized a frozen fill';end if;
 r:=jsonb_set(r,'{fields,S}','"60"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 -- Old Account in the Sheet: exact same-hotel tuple may resolve to a unique verified new Account.
 update public.ar_invoices set open=0,verification_state='cleared',synced_at=now() where hotel='TSAN' and account_id=scope and id='i';
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope||'-moved','new-i','SYNTH-CREDIT-I','SYNTH-CREDIT-F',d-10,100,100,'verified','standalone',false,now());
 s:=public.ar_tracker_preview(actor,'khao-lak','synthetic_credit_policy_tracker_12345','synthetic-v2',repeat('b',64),jsonb_build_array(r));
 if s->>'matchedRows'<>'1' or s->>'heldRows'<>'0' then raise exception 'preview rejected unique Account transfer';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 if (select account_id from ar_private.tracker_rows where region='khao-lak' and row_key=scope)<>scope||'-moved' then raise exception 'unique verified Account transfer was not reconciled';end if;
 if (select first_billing_date from public.ar_invoice_workflow where account_id=scope||'-moved' and invoice_id='new-i') is not null then raise exception 'old billing history restored a staff-cleared R on transfer';end if;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'unverified','SYNTH-CREDIT-I','SYNTH-CREDIT-F',d-10,100,100,'unknown','standalone',false,now());
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='identity' and status='pending') then raise exception 'unverified duplicate candidate was ignored during reassignment';end if;
 update public.ar_invoices set open=0 where account_id=scope and id='unverified';
 if exists(select 1 from ar_private.tracker_policy_match(r)) then raise exception 'unknown cached-zero candidate was silently ignored';end if;
 update public.ar_invoices set folio_no='SYNTH-OTHER-FOLIO' where account_id=scope and id='unverified';
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 -- Zero is explicit source evidence, never absence. Clear only warning records, preserve business rows.
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_pending');
 update public.ar_invoices set open=0,verification_state='cleared',synced_at=now() where hotel='TSAN' and account_id=scope||'-moved' and id='new-i';
 perform public.ar_tracker_membership(actor,'khao-lak',lease,jsonb_build_array(scope));
 if exists(select 1 from ar_private.tracker_conflicts where region='khao-lak' and row_key=scope and status='pending') then raise exception 'source-confirmed closed invoice still has pending warnings';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where region='khao-lak' and row_key=scope and field='AB' and status='resolved') then raise exception 'retired warning audit was deleted';end if;
 -- A rowKey reused for a different Invoice cannot borrow old zero evidence.
 r:=jsonb_set(r,'{invoiceNo}','"SYNTH-OTHER-INVOICE"');perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 perform public.ar_tracker_membership(actor,'khao-lak',lease,jsonb_build_array(scope));
 if not exists(select 1 from ar_private.tracker_conflicts where region='khao-lak' and row_key=scope and field='identity' and status='pending') then raise exception 'old zero evidence hid a current changed-identity warning';end if;
end $$;
rollback;
