begin;
set local statement_timeout='8s';
do $$
declare actor uuid;scope text:='SYNTH-PREVIEW-BENCH';rows jsonb;result jsonb;started timestamptz;elapsed numeric;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic preview benchmark','SYNTHETIC',202800,0,2028,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,'I'||n,'SYN-'||lpad(n::text,6,'0'),'F'||n,current_date-30,100,100,'verified','standalone',false,now() from generate_series(1,2028)n;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_original_preview_bench_12345',0);
 select jsonb_agg(jsonb_build_object('rowKey','SYNTH-KEY-'||n,'hotel','KAT','accountNo',scope,'invoiceNo','SYN-'||lpad(n::text,6,'0'),'folio','F'||n,'transactionDate',(current_date-30)::text,'locator',jsonb_build_object('row',n+2),'fieldHolds','[]'::jsonb,'fields',jsonb_build_object('R',(current_date-5)::text,'S','30.0','T',(current_date+25)::text,'U',null,'V',null,'W',null,'X',null,'Y','Source status','Z',null,'AA',null,'AB','Synthetic note','AC','Synthetic owner'))) into rows from generate_series(1,2028)n;
 started:=clock_timestamp();result:=public.ar_tracker_preview(actor,'phuket','synthetic_original_preview_bench_12345','synthetic-benchmark',repeat('a',64),rows);elapsed:=extract(epoch from clock_timestamp()-started);
 if result->>'matchedRows'<>'2028' or (result->>'eligibleFields')::integer<2028 then raise exception 'preview incomplete';end if;
 raise notice 'SYNTHETIC_PREVIEW_2028 elapsed_seconds=%',round(elapsed,3);
end $$;
rollback;
