begin;
do $$
declare actor uuid;scope text:='SYNTH-PREVIEW-ELIGIBILITY';rows jsonb;result jsonb;preview uuid;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic eligibility','SYNTHETIC',200,0,2,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'valid','VALID','F1',current_date-30,100,100,'verified','standalone',false,now()),('KAT',scope,'unknown','UNKNOWN','F2',current_date-30,100,100,'unknown','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_original_eligibility_12345',0);
 select jsonb_agg(jsonb_build_object('rowKey','SYNTH-'||id,'hotel','KAT','accountNo',scope,'invoiceNo',invoice_no,'folio',folio_no,'transactionDate',transaction_date::text,'locator',jsonb_build_object('row',2),'fields',jsonb_build_object('R',(current_date-5)::text,'S','30','T',null,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null))) into rows from public.ar_invoices where hotel='KAT' and account_id=scope;
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_original_eligibility_12345','synthetic-eligibility',repeat('a',64),rows);
 if result->>'matchedRows'<>'1' or result->>'heldRows'<>'1' then raise exception 'preview admitted unknown-source invoice';end if;
 result:=public.ar_tracker_confirm_preview(actor,'phuket',(result->>'previewId')::uuid,repeat('a',64),'synthetic-eligibility');
 if result->>'confirmed'<>'true' or result->>'imported'<>'1' then raise exception 'held row aborted eligible batch';end if;
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='unknown') is not null then raise exception 'unknown-source workflow changed';end if;
 -- Eligibility changing after a reviewed preview must be rechecked, not trusted
 -- from its earlier revision fence or allowed to abort unrelated valid rows.
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'changed','CHANGED','F3',current_date-30,100,100,'verified','standalone',false,now());
 select jsonb_build_array(jsonb_build_object('rowKey','SYNTH-changed','hotel','KAT','accountNo',scope,'invoiceNo','CHANGED','folio','F3','transactionDate',(current_date-30)::text,'locator',jsonb_build_object('row',3),'fields',jsonb_build_object('R',(current_date-5)::text,'S',null,'T',null,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null))) into rows;
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_original_eligibility_12345','synthetic-changed',repeat('b',64),rows);preview:=(result->>'previewId')::uuid;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=scope and id='changed';
 result:=public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('b',64),'synthetic-changed');
 if result->>'confirmed'<>'true' or result->>'imported'<>'0' or (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='changed') is not null then raise exception 'changed eligibility was not held';end if;
end $$;
rollback;
