begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-WARNING-LIFE-'||gen_random_uuid();lease uuid:=gen_random_uuid();r jsonb;before_dates jsonb;before_sent bigint;old_id uuid;result jsonb;d date:=current_date-30;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('TSAN',scope,scope,'Synthetic warning lifecycle','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'i',scope,null,d,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'TSAN',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_warning_lifecycle_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 r:=jsonb_build_object('rowKey',scope,'hotel','TSAN','accountNo',scope,'invoiceNo',scope,'folio',null,'transactionDate',d::text,'fields',jsonb_build_object('R',null,'S','30','U',(d+1)::text,'V',null,'W',null),'locator','{}'::jsonb);
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 select jsonb_build_object('R',first_billing_date,'stage',last_reminder_stage,'date',last_reminder_date) into before_dates from public.ar_invoice_workflow where account_id=scope and invoice_id='i';
 select count(*) into before_sent from public.ar_sent_events;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'S','reference_difference') returning id into old_id;
 update public.ar_invoices set open=0,verification_state='cleared',synced_at=now() where account_id=scope and id='i';
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if exists(select 1 from ar_private.tracker_conflicts where id=old_id and status='pending') then raise exception 'confirmed exact zero with absent Folio remains a current warning';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where id=old_id and status='archived' and retirement_reason='verified_zero') then raise exception 'closed warning audit disposition missing';end if;
 -- Reads also hide newly closed items before a later membership reconciliation.
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_closed');
 result:=public.ar_tracker_conflicts_page(actor,'khao-lak','all',null,null);
 if result->'counts'->>'all'<>'0' or jsonb_array_length(result->'rows')<>0 or public.ar_tracker_status(actor,'khao-lak')->>'conflictCount'<>'0' then raise exception 'status and page still show known closed warnings';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r||'{"accountNo":"SYNTH-UNMATCHED-ACCOUNT"}'::jsonb));
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='identity') then raise exception 'incomplete Account-only change borrowed another ledger zero';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_current_closed') on conflict(region,row_key,field) where status='pending' do nothing;
 -- The old warning hint may be stale; fresh provider identity must win.
 insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value) values('khao-lak',scope,'identity','ambiguous_or_missing_identity',r);
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(jsonb_set(r,'{invoiceNo}','"SYNTH-OTHER-INVOICE"')));
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='identity') then raise exception 'changed current identity borrowed old zero proof';end if;
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_current_closed') on conflict(region,row_key,field) where status='pending' do nothing;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'competitor',scope,'KNOWN-OTHER-FOLIO',d,100,100,'verified','standalone',false,now());
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='AB') then raise exception 'zero with absent Folio ignored compatible active transfer debt';end if;
 update public.ar_invoices set open=0,verification_state='unknown',folio_no=null where account_id=scope and id='competitor';
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='AB') then raise exception 'unknown zero competitor was treated as resolved';end if;
 update public.ar_invoices set verification_state='cleared' where account_id=scope and id='competitor';
 -- Unknown API source is never a new zero observation.
 update public.ar_invoices set verification_state='missing' where account_id=scope and id='i';
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='AB') then raise exception 'missing API source was silently closed';end if;
 update public.ar_invoices set verification_state='verified',open=100,synced_at=now() where account_id=scope and id='i';
 perform public.ar_tracker_membership(actor,'khao-lak',lease,'[]');
 if exists(select 1 from ar_private.tracker_conflicts where row_key=scope and status='pending') or exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope) then raise exception 'removed Sheet row remains a current warning';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='AB' and status='archived' and retirement_reason='sheet_row_removed') then raise exception 'removed-row warning history was deleted';end if;
 if (select open from public.ar_invoices where account_id=scope and id='i')<>100 then raise exception 'Sheet row removal cleared financial debt';end if;
 if (select jsonb_build_object('R',first_billing_date,'stage',last_reminder_stage,'date',last_reminder_date) from public.ar_invoice_workflow where account_id=scope and invoice_id='i') is distinct from before_dates or (select count(*) from public.ar_sent_events)<>before_sent then raise exception 'warning lifecycle altered staff dates or actual Sent';end if;
 -- A returned row is evaluated again; archiving is not a permanent acknowledgement.
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r||'{"ambiguous":true}'::jsonb));
 if not exists(select 1 from ar_private.tracker_current_conflicts where row_key=scope and field='identity') then raise exception 'returned ambiguous Sheet row cannot raise a new current warning';end if;
 if not exists(select 1 from ar_private.tracker_conflicts where id=old_id and status='archived') then raise exception 'reappearance rewrote original warning history';end if;
end $$;
rollback;
