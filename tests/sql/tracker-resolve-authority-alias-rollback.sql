-- Actual PL/pgSQL execution; fails before the authority alias migration.
begin;
do $$
declare actor uuid;scope text:='SYNTH-RESOLVE-ALIAS-'||gen_random_uuid();conflict uuid;rev integer;result jsonb;before_sent bigint;before_history bigint;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic alias regression','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'i','SYN-INVOICE','SYN-FOLIO',current_date-30,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope and invoice_id='i';
 perform public.ar_tracker_connect(actor,'phuket','synthetic_alias_original_12345',0);
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values,baseline)
 values('phuket',scope,'KAT',scope,'i',jsonb_build_object('hotel','KAT','accountNo',scope,'invoiceNo','SYN-INVOICE','folio','SYN-FOLIO'),'{}','{"S":"45"}','{"S":"30"}');
 insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values('phuket',scope,'S','reference_difference','"45"','"30"','"30"') returning id,revision into conflict,rev;
 select count(*) into before_sent from public.ar_sent_events;select count(*) into before_history from ar_private.tracker_history;
 result:=public.ar_tracker_resolve(actor,'phuket',conflict,rev,'keep_web');
 if result->>'resolved' is distinct from 'true' then raise exception 'reference review did not resolve: %',result;end if;
 if exists(select 1 from ar_private.tracker_conflicts where id=conflict and status='pending') or (select credit_term from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='i')<>30 then raise exception 'resolver c.field/reference semantics changed';end if;
 if (select count(*) from public.ar_sent_events)<>before_sent or (select count(*) from ar_private.tracker_history)<>before_history then raise exception 'reference review fabricated Sent or writeback history';end if;
 if has_function_privilege('anon','public.ar_tracker_resolve(uuid,text,uuid,integer,text)','execute') or has_function_privilege('authenticated','public.ar_tracker_resolve(uuid,text,uuid,integer,text)','execute') then raise exception 'resolver public privileges changed';end if;
end $$;
rollback;
