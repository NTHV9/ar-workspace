begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-BILLING-'||gen_random_uuid();day date:=(now() at time zone 'Asia/Bangkok')::date;input jsonb;preview jsonb;result jsonb;saved_record uuid;command uuid:=gen_random_uuid();correction uuid:=gen_random_uuid();before_workflow jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic portal account','SYNTHETIC_BILLING',300,0,3,'verified'),('TSK',scope,'Synthetic separate hotel','SYNTHETIC_BILLING',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,v,'Synthetic guest','INV-'||v,'FOL-'||v,day-20,100,100,'verified','standalone',false,now() from unnest(array['A','B','C'])v;
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,billing_method) values('KAT',scope,true,30,'system');
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,settings_revision=0 where hotel='KAT' and account_id=scope;
 input:=jsonb_build_object('commandId',command,'action','record','hotel','KAT','accountId',scope,'actualDate',day-3,'channel','system','reference','Synthetic portal confirmation','note','Synthetic verification only','amount',null,'lines',jsonb_build_array(jsonb_build_object('invoiceId','A','revision',0)));
 preview:=public.ar_external_billing_preview(actor,input);if preview?'error' or (preview->'preview'->'lines'->0->>'dueAfter')::date<>day+27 then raise exception 'external billing preview: %',preview;end if;
 if exists(select 1 from public.ar_invoice_workflow where account_id=scope and first_billing_date is not null) then raise exception 'preview wrote history';end if;
 result:=public.ar_external_billing_save(actor,input,'wrong');if result->>'error'<>'billing_preview_changed' then raise exception 'unreviewed write accepted';end if;
 result:=public.ar_external_billing_save(actor,input,preview->>'digest');if result?'error' then raise exception 'external record: %',result;end if;saved_record:=(result->>'recordId')::uuid;
 if (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A')<>day-3 or (select due_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A')<>day+27 or exists(select 1 from public.ar_invoice_workflow where account_id=scope and invoice_id<>'A' and first_billing_date is not null) then raise exception 'external billing escaped selection';end if;
 if public.ar_external_billing_save(actor,input,'already-applied')->>'replayed'<>'true' then raise exception 'retry duplicated';end if;
 if public.ar_external_billing_save(actor,jsonb_set(input,'{note}','"Changed"'),'already-applied')->>'error'<>'billing_command_conflict' then raise exception 'changed retry accepted';end if;
 select to_jsonb(w) into before_workflow from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A';
 input:=(input-'lines')||jsonb_build_object('commandId',correction,'action','correct','recordId',saved_record,'revision',1,'actualDate',day-2,'reference','Corrected synthetic reference','reason','Correct the external evidence date');preview:=public.ar_external_billing_preview(actor,input);result:=public.ar_external_billing_save(actor,input,preview->>'digest');if result?'error' or result->>'revision'<>'2' then raise exception 'correction failed: %',result;end if;
 if (select to_jsonb(w) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A') is distinct from before_workflow then raise exception 'correction rewrote invoice history';end if;
 input:=jsonb_build_object('commandId',gen_random_uuid(),'action','void','hotel','KAT','accountId',scope,'recordId',saved_record,'revision',2,'reason','Synthetic correction audit');preview:=public.ar_external_billing_preview(actor,input);result:=public.ar_external_billing_save(actor,input,preview->>'digest');if result?'error' then raise exception 'void failed: %',result;end if;
 result:=public.ar_external_billing_read(actor,'KAT',scope);if result->'summary'->>'records'<>'0' or result->>'total'<>'1' then raise exception 'void lost evidence or counted activity';end if;
 input:=input||jsonb_build_object('commandId',gen_random_uuid(),'action','restore','revision',3);preview:=public.ar_external_billing_preview(actor,input);result:=public.ar_external_billing_save(actor,input,preview->>'digest');if result?'error' then raise exception 'restore failed: %',result;end if;
 result:=public.ar_external_billing_read(actor,'KAT',scope);if result->'summary'->>'records'<>'1' or result->'summary'->>'firstBillingInvoices'<>'1' or result->'summary'->'amount' is distinct from 'null'::jsonb or result->'summary'->>'unknownAmounts'<>'1' then raise exception 'external activity totals wrong';end if;
 if exists(select 1 from public.ar_sent_events where account_id=scope) then raise exception 'external billing fabricated Gmail SENT';end if;
 if (select count(*) from ar_private.external_billing_events where record_id=saved_record)<>4 then raise exception 'external immutable history incomplete';end if;
 if public.ar_external_billing_preview(gen_random_uuid(),input)->>'error'<>'billing_forbidden' or has_function_privilege('anon','public.ar_external_billing_save(uuid,jsonb,text)','execute') then raise exception 'external actor gate missing';end if;
end$$;
rollback;
select 'External billing preview/selection/retry/correction/void/restore/unknown amount checks passed and rolled back' as result;
