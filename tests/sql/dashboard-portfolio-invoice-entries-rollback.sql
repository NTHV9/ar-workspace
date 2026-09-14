-- Synthetic current Portfolio and deliberately different financial-history rows.
-- No provider requests. All rows and test-only updates roll back.
begin;
do $$
declare
 actor uuid;scope text:='SYNTHETIC-PORTFOLIO-ENTRY-'||gen_random_uuid();kind text:='SYNTHETIC_PORTFOLIO_ENTRY';other_scope text;
 d date:=(current_timestamp at time zone 'Asia/Bangkok')::date;stamp timestamptz:=current_timestamp;run uuid:=gen_random_uuid();
 r jsonb;page_two jsonb;overview jsonb;direct jsonb;history_before jsonb;current_before jsonb;invoice_before jsonb;pending_before bigint;before_close jsonb;
 h text;bad_date date;bad_text text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'synthetic Portfolio invoice test requires approved actor';end if;
 other_scope:=scope||'-OTHER';
 if has_function_privilege('anon','public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)','execute')
  or has_function_privilege('authenticated','public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)','execute')
  or not has_function_privilege('service_role','public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)','execute')
 then raise exception 'Portfolio invoice reader ACL leaked';end if;
 if not exists(select 1 from pg_proc where oid='public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)'::regprocedure and provolatile='s' and prosecdef and proconfig=array['search_path=""'])
 then raise exception 'Portfolio invoice stable snapshot/search path contract missing';end if;
 if public.ar_dashboard_invoice_entries(null,d,d)->>'error' is distinct from 'dashboard_forbidden'
  or public.ar_dashboard_invoice_entries(gen_random_uuid(),d,d)->>'error' is distinct from 'dashboard_forbidden'
  or public.ar_dashboard_invoice_entries(actor,null,d)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d+1)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d-1)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d-3661,d)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d,null,scope)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d,'WRONG')->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d,'KAT',null,null,-1,50)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_invoice_entries(actor,d,d,'KAT',null,null,0,201)->>'error' is distinct from 'dashboard_invalid'
 then raise exception 'Portfolio invoice actor/argument validation missing';end if;
 foreach bad_date in array array['infinity'::date,'-infinity'::date] loop
  if public.ar_dashboard_invoice_entries(actor,bad_date,bad_date)->>'error' is distinct from 'dashboard_invalid' then raise exception 'nonfinite date accepted';end if;
 end loop;
 foreach bad_text in array array['',' ',chr(127)] loop
  if public.ar_dashboard_invoice_entries(actor,d,d,'KAT',null,bad_text)->>'error' is distinct from 'dashboard_invalid'
   or public.ar_dashboard_invoice_entries(actor,d,d,'KAT',bad_text)->>'error' is distinct from 'dashboard_invalid' then raise exception 'invalid account/type accepted';end if;
 end loop;

 update public.ar_refresh_state set last_success_at=stamp,last_attempt_at=stamp,status='succeeded',error_code=null where hotel in('KAT','TSK');
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at)
 values('KAT',scope,'Synthetic Portfolio invoice account',kind,175,0,5,'verified',stamp),
  ('TSK',scope,'Synthetic second hotel account',kind,25.50,0,1,'verified',stamp),
  ('KAT',other_scope,'Synthetic other account',kind||'_OTHER',5.50,0,1,'verified',stamp);
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'101','REPEATED','F-101',d-1,100.10,80,'verified','standalone',false,stamp),
  ('KAT',scope,'102','REPEATED','F-102',d-1,50.20,40,'verified','standalone',false,stamp),
  ('KAT',scope,'103','PARENT','F-103',d-1,60.30,60,'verified','parent',true,stamp),
  ('KAT',scope,'105','CREDIT','F-105',d-1,-10.40,-5,'verified','standalone',false,stamp),
  ('KAT',scope,'106','CLOSED','F-106',d-1,77,0,'cleared','standalone',false,stamp),
  ('KAT',scope,'107','OTHER-DATE','F-107',d-2,999,999,'verified','standalone',false,stamp),
  ('TSK',scope,'101','REPEATED','F-101',d-1,25.50,25.50,'verified','standalone',false,stamp),
  ('KAT',other_scope,'101','REPEATED','F-101',d-1,5.50,5.50,'verified','standalone',false,stamp);
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 values('KAT',scope,'104','CHILD',d-1,60.30,60,'verified','child',false,'PARENT','103',60,stamp);
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->>'source' is distinct from 'portfolio' or r->>'view' is distinct from 'invoice_entries'
  or r->'coverage'->>'complete' is distinct from 'true' or r->'summary'->>'dateBasis' is distinct from 'invoice_transaction_date'
  or r->'summary'->>'amountBasis' is distinct from 'original_invoice_amount' or r->'summary'->>'amount' is distinct from '277.20'
  or r->'summary'->>'invoiceCount' is distinct from '5' or r->'summary'->>'compressedChildren' is distinct from '0'
  or r->'summary'->>'credits' is distinct from '1' or r->>'total' is distinct from '5'
 then raise exception 'Portfolio scope changed dates, signs, roots or original amount';end if;
 if (select count(*) from jsonb_array_elements(r->'rows')v where v->>'invoiceNo'='REPEATED')<>2
  or exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionDate'<>(d-1)::text or v->>'transactionId'='107')
  or not exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='106' and v->>'originalAmount'='77.00' and v->>'openAmount'='0.00' and v->>'sourceStatus'='observed')
  or not exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='105' and v->>'originalAmount'='-10.40' and v->>'openAmount'='-5.00')
  or exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='104' or v->>'collectionRole'='child')
 then raise exception 'raw Portfolio rows were deduplicated by printed number or lost details';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,null,null,kind);
 if r->'summary'->>'invoiceCount' is distinct from '6' or r->'summary'->>'amount' is distinct from '302.70' or r->>'total' is distinct from '6'
 then raise exception 'Hotel + Account + transaction identities collapsed or type ignored';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',other_scope,kind||'_OTHER');
 if r->'summary'->>'amount' is distinct from '5.50' or r->'summary'->>'invoiceCount' is distinct from '1' then raise exception 'Account filter ignored';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope,kind||'_OTHER');
 if r->'summary'->>'amount' is distinct from '0.00' or r->>'total' is distinct from '0' then raise exception 'combined Account/Type filter ignored';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-2,d-1,'KAT',scope);
 if r->'summary'->>'invoiceCount' is distinct from '6' or r->'summary'->>'amount' is distinct from '1276.20' then raise exception 'inclusive Bill Date range failed';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d,d,'KAT',scope);
 if r->'summary'->>'amount' is distinct from '0.00' or r->>'total' is distinct from '0' then raise exception 'synced date replaced Bill Date';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope,null,0,2);
 page_two:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope,null,2,2);
 if r->'summary' is distinct from page_two->'summary' or r->'summary'->>'amount' is distinct from '277.20'
  or jsonb_array_length(r->'rows')<>2 or jsonb_array_length(page_two->'rows')<>2
  or exists(select 1 from jsonb_array_elements(r->'rows')a join jsonb_array_elements(page_two->'rows')b on a->>'transactionId'=b->>'transactionId')
 then raise exception 'pagination changed summary or repeated identities';end if;

 -- Payment closure changes the open amount, never the Bill Date entry count or
 -- original value. Both verified zero and source-confirmed cleared zero qualify.
 before_close:=r->'summary';
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=scope and id='101';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'summary' is distinct from before_close or r->>'total' is distinct from '5'
  or not exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='101' and v->>'openAmount'='0.00' and v->>'originalAmount'='100.10' and v->>'sourceStatus'='observed')
 then raise exception 'clearing an invoice reduced its Bill Date count or original amount';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=scope and id='101';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'summary' is distinct from before_close then raise exception 'verified zero invoice lost Bill Date membership';end if;
 update public.ar_invoices set open=80 where hotel='KAT' and account_id=scope and id='101';
 update public.ar_accounts set open=0,verification_state='cleared' where hotel='KAT' and id=other_scope;
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=other_scope and id='101';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',other_scope);
 if r->'coverage'->>'complete' is distinct from 'true' or r->'summary'->>'invoiceCount' is distinct from '1' or r->'summary'->>'amount' is distinct from '5.50'
 then raise exception 'cleared account/invoice lost verified Bill Date entry';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=other_scope and id='101';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',other_scope);
 if r->'coverage'->>'complete' is distinct from 'true' or r->'summary'->>'amount' is distinct from '5.50' then raise exception 'cleared zero account blocked verified invoice';end if;
 update public.ar_accounts set open=5.50 where hotel='KAT' and id=other_scope;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',other_scope);
 if r->'coverage'->>'complete' is distinct from 'false' then raise exception 'cleared account with nonzero balance was trusted';end if;
 update public.ar_accounts set verification_state='verified' where hotel='KAT' and id=other_scope;
 update public.ar_invoices set open=5.50 where hotel='KAT' and account_id=other_scope and id='101';
 update public.ar_invoices set verification_state='cleared' where hotel='KAT' and account_id=other_scope and id='101';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',other_scope);
 if r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->>'notObserved' is distinct from '1'
  or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'cleared invoice with nonzero balance was trusted';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=other_scope and id='101';

 -- Historical-only entries must never appear as current Portfolio invoices.
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at)
 values(run,actor,'KAT',d-1,d-1,'manual','synthetic-portfolio-history','succeeded',true,stamp);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id)
 values('KAT',scope,'Synthetic historical account',kind,stamp,run);
 insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
 values(run,'KAT',d-1,d-1,stamp,1,1,0,0,true,true,'synthetic-portfolio-history');
 insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'909',d-1,888,888,0,jsonb_build_object('hotel','KAT','accountId',scope,'transactionId','909','transactionDate',d-1,'originalAmount','888.00','entryClassification','invoice','collectionRole','standalone'),'observed',stamp,stamp,stamp,run);
 history_before:=public.ar_financial_report(actor,'invoice_entries','KAT',scope,null,d-1,d-1);
 select jsonb_agg(to_jsonb(a) order by a.hotel,a.id) into current_before from public.ar_accounts a where id=scope;
 select jsonb_agg(to_jsonb(i) order by i.hotel,i.id) into invoice_before from public.ar_invoices i where account_id=scope;
 select count(*) into pending_before from ar_private.financial_runs;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'summary'->>'amount' is distinct from '277.20' or exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='909')
 then raise exception 'historical-only invoice entered current Portfolio report';end if;
 overview:=public.ar_dashboard_hotel_overview(actor,d-1,d-1,kind);
 foreach h in array array[null,'KAT','TSK'] loop
  direct:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,h,null,kind,0,1);
  r:=case h when 'KAT' then overview->'hotels'->0 when 'TSK' then overview->'hotels'->1 else overview->'total' end;
  if r->'entries' is distinct from jsonb_build_object('summary',direct->'summary','coverage',direct->'coverage') then raise exception 'hotel overview did not use same Portfolio reader';end if;
  direct:=public.ar_financial_report(actor,'payments',h,null,kind,d-1,d-1,0,1);
  if r->'payments' is distinct from jsonb_build_object('summary',direct->'summary','coverage',direct->'coverage') then raise exception 'Portfolio change rewired payment history';end if;
 end loop;
 if public.ar_financial_report(actor,'invoice_entries','KAT',scope,null,d-1,d-1) is distinct from history_before
  or (select jsonb_agg(to_jsonb(a) order by a.hotel,a.id) from public.ar_accounts a where id=scope) is distinct from current_before
  or (select jsonb_agg(to_jsonb(i) order by i.hotel,i.id) from public.ar_invoices i where account_id=scope) is distinct from invoice_before
  or (select count(*) from ar_private.financial_runs)<>pending_before then raise exception 'Portfolio report mutated ledger, history or queued a fetch';end if;

 -- Unknown non-child rows stay visible, while totals become explicitly unknown.
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'108','UNVERIFIED',d-1,1,1,'verified','unverified',null,stamp);
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->>'total' is distinct from '6' or r->'summary'->>'invoiceCount' is distinct from '5' or r->'summary'->>'knownAmount' is distinct from '277.20'
  or r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->>'unknownAmounts' is distinct from '1' or r->'summary'->'amount' is distinct from 'null'::jsonb
 then raise exception 'unverified non-child was hidden or converted to known count/value';end if;
 update public.ar_invoices set collection_role='standalone',compressed=false,verification_state='missing' where hotel='KAT' and account_id=scope and id='108';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->>'notObserved' is distinct from '1' then raise exception 'missing non-child accepted';end if;
 update public.ar_invoices set open=0 where hotel='KAT' and account_id=scope and id='108';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->>'total' is distinct from '6' or r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->>'notObserved' is distinct from '1' then raise exception 'unverified zero was hidden or trusted';end if;
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=scope and id='108';
 update public.ar_invoices set verification_state='missing' where hotel='KAT' and account_id=scope and id='104';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'coverage'->>'complete' is distinct from 'true' or r->'summary'->>'notObserved' is distinct from '0' or r->'summary'->>'amount' is distinct from '278.20' or r->'summary'->>'invoiceCount' is distinct from '6'
 then raise exception 'excluded child erased totals or verified closed invoice was omitted';end if;
 update public.ar_accounts set verification_state='missing' where hotel='KAT' and id=scope;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'unverified account became known';end if;
 update public.ar_accounts set verification_state='verified' where hotel='KAT' and id=scope;
 update public.ar_refresh_state set status='failed',error_code='synthetic_refresh_failure',last_attempt_at=stamp+interval '1 second' where hotel='KAT';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'coverage'->>'complete' is distinct from 'true' or r->'coverage'->>'lastAttemptStatus' is distinct from 'failed'
  or r->'summary'->>'amount' is distinct from '278.20' then raise exception 'failed latest attempt invalidated verified current publication';end if;
 update public.ar_refresh_state set last_success_at=null,status='unknown' where hotel='TSK';
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,null,null,kind);
 if r->'coverage'->>'complete' is distinct from 'false' or r->'coverage'->'lastSuccessAt' is distinct from 'null'::jsonb or r->'summary'->'amount' is distinct from 'null'::jsonb
 then raise exception 'missing hotel source fabricated combined total';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->'summary'->>'amount' is distinct from '278.20' then raise exception 'another hotel erased selected current source';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d,d,'TSK',scope);
 if r->'coverage'->>'complete' is distinct from 'false' or r->'coverage'->'lastAttemptStatus' is distinct from 'null'::jsonb then raise exception 'unknown source state became a verified empty day';end if;
end$$;
rollback;
