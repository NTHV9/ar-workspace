begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-CLOSED-WARN-'||gen_random_uuid();lease uuid:=gen_random_uuid();r jsonb;d date:=current_date-30;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('TSAN',scope,scope,'Synthetic historical closure','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'i',scope,'SYN-FOLIO',d,100,100,'verified','standalone',false,now());
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_closed_warning_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 r:=jsonb_build_object('rowKey',scope,'hotel','TSAN','accountNo',scope,'invoiceNo',scope,'folio','SYN-FOLIO','transactionDate',d::text,'fields',jsonb_build_object('R',null,'S',null,'U',null,'V',null,'W',null),'locator','{}'::jsonb);
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(r));
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'S','reference_difference');
 update public.ar_invoices set open=0,verification_state='cleared',synced_at=now() where hotel='TSAN' and account_id=scope and id='i';
 update ar_private.invoice_verified_balances set verified_at=now()-interval '30 days',zero_since=now()-interval '30 days' where hotel='TSAN' and account_id=scope and invoice_id='i';
 update public.ar_invoices set synced_at=now()-interval '30 days' where hotel='TSAN' and account_id=scope and id='i';
 perform public.ar_tracker_membership(actor,'khao-lak',lease,'[]');
 if exists(select 1 from ar_private.tracker_conflicts where row_key=scope and status='pending') then raise exception 'historical confirmed zero warning never retires after Sheet row removal';end if;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_partial_source');
 update ar_private.tracker_rows set present=true where row_key=scope;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSAN',scope,'partial',scope,null,d,100,0,'unknown','standalone',false,now());
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='AB' and status='pending') then raise exception 'unknown partial source failed to veto zero-warning retirement';end if;
 update public.ar_invoices set folio_no='SYNTH-NONMATCHING' where account_id=scope and id='partial';
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 -- Even an old confirmed zero cannot hide a reused/changed Invoice identity.
 perform public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(jsonb_set(r,'{invoiceNo}','"SYNTH-DIFFERENT-INVOICE"')));
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='identity' and status='pending') then raise exception 'archived changed identity borrowed unrelated zero proof';end if;
 perform public.ar_tracker_membership(actor,'khao-lak',lease,'[]');
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='identity' and status='archived' and retirement_reason='sheet_row_removed') then raise exception 'removed changed row did not retain archived warning history';end if;
 -- Missing is uncertainty even when an older zero proof remains in the ledger.
 update public.ar_invoices set verification_state='missing' where hotel='TSAN' and account_id=scope and id='i';
 update ar_private.tracker_rows set present=true where row_key=scope;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason) values('khao-lak',scope,'AB','synthetic_source_missing');
 perform ar_private.tracker_retire_closed_warnings('khao-lak');
 if not exists(select 1 from ar_private.tracker_conflicts where row_key=scope and field='AB' and status='pending') then raise exception 'missing API source was treated as confirmed zero';end if;
end $$;
rollback;
