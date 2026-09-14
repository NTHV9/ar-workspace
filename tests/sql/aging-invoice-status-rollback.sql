-- Synthetic only; no provider data or effects. Entire fixture rolls back.
begin;
do $$
declare actor uuid;a text:='SYNTHETIC-AGING-'||gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;r jsonb;b jsonb:='["91 - 120",91,120,4]';p timestamptz:=now()-interval '1 hour';dimension text;page_ids text[]:='{}';page_index integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at,"agingBuckets") values('KAT',a,'Synthetic Aging','SYNTHETIC_AGING',550,550,3,'verified',p,'[{"label":"91 - 120","start":91,"end":120,"sequence":4,"amount":550,"debit":600,"credit":50}]');
 update public.ar_refresh_state set last_success_at=p,status='running' where hotel='KAT';
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values
 ('KAT',a,'A',d-100,100,100,100,'verified','standalone',false,p),('KAT',a,'B',d-100,200,200,100,'verified','standalone',false,p),('KAT',a,'P',d-100,300,300,100,'verified','parent',true,p),('KAT',a,'CREDIT',d-100,-50,-50,100,'verified','standalone',false,p),('KAT',a,'ZERO',d-100,10,0,100,'verified','standalone',false,p);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at) values('KAT',a,'CHILD',d-100,20,20,100,'verified','child',false,'P','P',300,p);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=a;
 update public.ar_invoice_workflow set first_billing_date=d-40,last_reminder_stage='Follow 2',last_reminder_date=d-2 where hotel='KAT' and account_id=a and invoice_id='B';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,null,null,true,0,1);
 if r?'error' or r->>'complete'<>'true' or r->'summary'->>'count'<>'4' or r->'summary'->>'amount'<>'550.00' or r->'summary'->>'creditAmount'<>'50.00' or r->>'total'<>'4' or jsonb_array_length(r->'rows')<>1 then raise exception 'positive roots, credits, pagination or refresh freshness failed: %',r;end if;
 if jsonb_array_length(r->'accounts'->0->'buckets')<>2 or exists(select 1 from jsonb_array_elements(r->'accounts'->0->'buckets')x where x->>'count' is distinct from '4' or x->>'amount' is distinct from '550.00' or x->>'creditAmount' is distinct from '50.00') then raise exception 'account Aging table count or net differs from drill summary';end if;
 if not exists(select 1 from jsonb_array_elements(r->'summary'->'billing')f where f->>'key'='unbilled' and f->>'count'='2') or not exists(select 1 from jsonb_array_elements(r->'summary'->'followup')f where f->>'key'='Follow 2' and f->>'count'='1') then raise exception 'independent workflow/manual facets failed: %',r;end if;
 -- Each mutually exclusive dimension partitions all four signed roots once.
 foreach dimension in array array['billing','followup','due'] loop
  if (select count(*) from jsonb_array_elements(r->'summary'->dimension)f where f->>'key'='credit')<>1
   or not exists(select 1 from jsonb_array_elements(r->'summary'->dimension)f where f->>'key'='credit' and f->>'count'='1' and f->>'amount'='-50.00')
   or (select sum((f->>'count')::integer) from jsonb_array_elements(r->'summary'->dimension)f)<>4
   or (select sum((f->>'amount')::numeric) from jsonb_array_elements(r->'summary'->dimension)f)<>550 then raise exception 'signed status partition failed: %',dimension;end if;
 end loop;
 for page_index in 0..3 loop
  r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,null,null,true,page_index,1);
  if r->>'total' is distinct from '4' or jsonb_array_length(r->'rows')<>1 then raise exception 'signed pagination denominator changed';end if;
  page_ids:=array_append(page_ids,r->'rows'->0->>'invoiceId');
 end loop;
 if page_ids is distinct from array['P','B','A','CREDIT'] then raise exception 'signed rows skipped or repeated across pages: %',page_ids;end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,null,null,true,4,1);
 if r->>'total' is distinct from '4' or jsonb_array_length(r->'rows')<>0 then raise exception 'signed final page failed';end if;
 -- Credits keep their true exception flags but never inherit actionable workflow labels/dates.
 update public.ar_invoice_workflow set first_billing_date=d-40,last_reminder_stage='Final',last_reminder_date=d-2 where hotel='KAT' and account_id=a and invoice_id='CREDIT';
 insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,held,hold_reason,needs_review,review_reason) values('KAT',a,'CREDIT',true,'Synthetic hold',true,'Synthetic review');
 foreach dimension in array array['billing','followup','due'] loop
  r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,dimension,'credit',true);
  if r?'error' or r->>'total' is distinct from '1' or r->'rows'->0->>'invoiceId' is distinct from 'CREDIT'
   or r->'rows'->0->>'open' is distinct from '-50.00' or r->'rows'->0->>'billingStatus' is distinct from 'credit'
   or r->'rows'->0->>'latestStage' is distinct from 'credit' or r->'rows'->0->>'latestStageLabel' is distinct from 'Credit'
   or r->'rows'->0->>'dueStatus' is distinct from 'credit' or r->'rows'->0->'dueDate' is distinct from 'null'::jsonb
   or r->'rows'->0->>'held' is distinct from 'true' or r->'rows'->0->>'needsReview' is distinct from 'true' then raise exception 'credit drill status or flags failed: %',r;end if;
 end loop;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,'flags','held',true);
 if r->>'total' is distinct from '1' or r->'rows'->0->>'invoiceId' is distinct from 'CREDIT'
  or not exists(select 1 from jsonb_array_elements(r->'summary'->'flags')f where f->>'key'='held' and f->>'count'='1' and f->>'amount'='-50.00') then raise exception 'signed flag facet excluded credit';end if;
 delete from public.ar_invoice_exceptions where hotel='KAT' and account_id=a and invoice_id='CREDIT';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,'due','past_due',true);
 if r->>'total'<>'1' or r->'rows'->0->>'invoiceId'<>'B' or r->'summary'->>'count'<>'4' then raise exception 'due filtering changed denominator';end if;
 r:=public.ar_aging_invoice_status(actor,p_accounts=>jsonb_build_array(jsonb_build_array('KAT',a)),p_details=>true,p_flag=>'held');
 if r->>'total'<>'0' or r->'summary'->>'count'<>'4' then raise exception 'exact members or independent flag denominator failed';end if;
 r:=public.ar_aging_invoice_status(actor,p_accounts=>jsonb_build_array(jsonb_build_array('KAT',a),jsonb_build_array('KAT',a||'-MISSING')));
 if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb then raise exception 'missing exact member silently widened';end if;
 update public.ar_invoice_workflow set last_reminder_stage='Friendly',last_reminder_date=d+2 where hotel='KAT' and account_id=a and invoice_id='A';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,'followup','unknown',true);
 if r->>'total'<>'1' or r->'rows'->0->>'latestStage'<>'unknown' or r->'rows'->0->>'needsReview'<>'true' then raise exception 'future historical stage became no follow-up';end if;
 update public.ar_invoice_workflow set last_reminder_stage=null,last_reminder_date=null where hotel='KAT' and account_id=a and invoice_id='A';
 update public.ar_invoices set verification_state='cleared' where hotel='KAT' and account_id=a and id='A';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete'<>'false' then raise exception 'cleared positive invoice counted';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=a and id='A';
 if ar_private.aging_schema_valid('[{"label":"A","start":0,"end":30,"sequence":1,"amount":0,"debit":0,"credit":0},{"label":"B","start":20,"end":60,"sequence":2,"amount":0,"debit":0,"credit":0}]') then raise exception 'overlapping schema accepted';end if;
 -- Unknown credit membership makes signed bucket counts/net unavailable; no invented bucket.
 update public.ar_invoices set age=null where hotel='KAT' and account_id=a and id='CREDIT';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'false' or r->'summary'->'count' is distinct from 'null'::jsonb or r->'summary'->'amount' is distinct from 'null'::jsonb or r->'summary'->'creditAmount' is distinct from 'null'::jsonb then raise exception 'unknown credit placement produced known signed bucket';end if;
 if jsonb_array_length(r->'accounts'->0->'buckets')<>2 or not exists(select 1 from jsonb_array_elements(r->'accounts'->0->'buckets')x where x->>'key' is not null and x->>'complete'='false' and x->'count'='null'::jsonb and x->'amount'='null'::jsonb and x->'creditAmount'='null'::jsonb) then raise exception 'bucket credit uncertainty lost or invented bucket';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '4' or r->'summary'->>'amount' is distinct from '550.00' or r->'summary'->>'creditAmount' is distinct from '50.00' then raise exception 'unknown credit age erased known signed all-ages inventory';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,null,'due','credit',true);
 if r->>'total' is distinct from '1' or r->'rows'->0->>'invoiceId' is distinct from 'CREDIT' or r->'rows'->0->'age' is distinct from 'null'::jsonb then raise exception 'unknown-age credit missing from all-ages drill';end if;
 update public.ar_invoices set age=100 where hotel='KAT' and account_id=a and id='CREDIT';
 -- Exact, verified zero-parent history is retained when that parent is absent.
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at)
 values('KAT',a,'HIST-CHILD',d-100,80,80,100,'verified','child',false,'ABSENT-PARENT','ABSENT-NO',0,p),
 ('KAT',a,'HIST-CREDIT',d-100,-20,-20,100,'verified','child',false,'ABSENT-PARENT','ABSENT-NO',0,p);
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '4' or r->'summary'->>'amount' is distinct from '550.00' or r->'summary'->>'creditAmount' is distinct from '50.00' then raise exception 'same-publication absent zero-parent children affected independent debt';end if;
 update public.ar_invoices set parent_open=10 where hotel='KAT' and account_id=a and id='HIST-CHILD';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'false' or r->'summary'->'count' is distinct from 'null'::jsonb then raise exception 'absent positive parent was silently excluded';end if;
 update public.ar_invoices set parent_open=0,synced_at=p-interval '1 second' where hotel='KAT' and account_id=a and id='HIST-CHILD';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'false' then raise exception 'stale zero-parent evidence accepted';end if;
 update public.ar_invoices set synced_at=p where hotel='KAT' and account_id=a and id='HIST-CHILD';
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('KAT',a,'CONFLICT-PARENT','ABSENT-NO',d-100,10,0,100,'verified','standalone',false,p);
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'false' then raise exception 'conflicting present parent number accepted';end if;
 delete from public.ar_invoices where hotel='KAT' and account_id=a and id='CONFLICT-PARENT';
 update public.ar_invoices set age=null where hotel='KAT' and account_id=a and id='A';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb then raise exception 'unknown age became known bucket count';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r?'error' or r->>'complete'<>'true' or r->'summary'->>'count'<>'4' then raise exception 'unknown age removed positive net invoice';end if;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=a and id='A';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb then raise exception 'unverified source counted';end if;
 if public.ar_aging_invoice_status(gen_random_uuid())->>'error'<>'aging_forbidden' then raise exception 'actor check absent';end if;
 if public.ar_aging_invoice_status(actor,'KAT',null,null,a)->>'error'<>'aging_invalid' then raise exception 'cross hotel scope accepted';end if;
 if has_function_privilege('anon','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute') or has_function_privilege('authenticated','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute') then raise exception 'public RPC privilege leak';end if;
end$$;
do $$
declare actor uuid;a text:='SYNTHETIC-SIGNED-AGING-'||gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;p timestamptz:=now()-interval '1 hour';r jsonb;b jsonb:='["91 - 120",91,120,4]';dimension text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at,"agingBuckets") values
 ('KAT',a,'Synthetic credit-only','SYNTHETIC_CREDIT_ONLY',-60,-50,2,'verified',p,'[{"label":"0 - 30","start":0,"end":30,"sequence":1,"amount":-10,"debit":0,"credit":10},{"label":"91 - 120","start":91,"end":120,"sequence":4,"amount":-50,"debit":0,"credit":50}]'),
 ('TSK',a,'Synthetic same identity other hotel','SYNTHETIC_CREDIT_ONLY',-20,-20,1,'verified',p,'[{"label":"91 - 120","start":91,"end":120,"sequence":4,"amount":-20,"debit":0,"credit":20}]'),
 ('KAT',a||'-NETZERO','Synthetic net zero','SYNTHETIC_NET_ZERO',0,0,2,'verified',p,'[{"label":"91 - 120","start":91,"end":120,"sequence":4,"amount":0,"debit":100,"credit":100}]');
 update public.ar_refresh_state set last_success_at=p,status='running' where hotel in('KAT','TSK');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values
 ('KAT',a,'CREDIT-PARENT',d-100,-50,-50,100,'verified','parent',true,p),
 ('KAT',a,'CREDIT-YOUNG',d-20,-10,-10,20,'verified','standalone',false,p),
 ('KAT',a,'ZERO',d-100,0,0,100,'cleared','standalone',false,p),
 ('TSK',a,'CREDIT-PARENT',d-100,-20,-20,100,'verified','standalone',false,p),
 ('KAT',a||'-NETZERO','POSITIVE',d-100,100,100,100,'verified','standalone',false,p),
 ('KAT',a||'-NETZERO','CREDIT',d-100,-100,-100,100,'verified','standalone',false,p);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at)
 values('KAT',a,'NEGATIVE-CHILD',d-100,-5,-5,null,'verified','child',false,'CREDIT-PARENT','CREDIT-PARENT',-50,p);
 r:=public.ar_aging_invoice_status(actor,'KAT','SYNTHETIC_CREDIT_ONLY',a,null,null,null,null,true);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '2' or r->'summary'->>'amount' is distinct from '-60.00' or r->'summary'->>'creditAmount' is distinct from '60.00'
  or r->>'total' is distinct from '2' or jsonb_array_length(r->'rows')<>2 then raise exception 'credit-only roots, child exclusion or hotel/type scope failed: %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r->'accounts'->0->'buckets')x where x->'key'='null'::jsonb and x->>'count'='2' and x->>'amount'='-60.00' and x->>'creditAmount'='60.00')
  or not exists(select 1 from jsonb_array_elements(r->'accounts'->0->'buckets')x where (x->>'key')::jsonb=b and x->>'count'='1' and x->>'amount'='-50.00' and x->>'creditAmount'='50.00') then raise exception 'credit-only account table count or scoped net failed';end if;
 foreach dimension in array array['billing','followup','due'] loop
  if (select count(*) from jsonb_array_elements(r->'summary'->dimension)f where f->>'key'='credit')<>1
   or not exists(select 1 from jsonb_array_elements(r->'summary'->dimension)f where f->>'key'='credit' and f->>'count'='2' and f->>'amount'='-60.00')
   or exists(select 1 from jsonb_array_elements(r->'summary'->dimension)f where f->>'key'<>'credit' and ((f->>'count')::integer<>0 or (f->>'amount')::numeric<>0)) then raise exception 'credit-only status became actionable: %',dimension;end if;
 end loop;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,null,null,true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '1' or r->'summary'->>'amount' is distinct from '-50.00' or r->'summary'->>'creditAmount' is distinct from '50.00' or r->'rows'->0->>'invoiceId' is distinct from 'CREDIT-PARENT' then raise exception 'credit bucket scope or negative child membership failed';end if;
 r:=public.ar_aging_invoice_status(actor,p_type=>'SYNTHETIC_CREDIT_ONLY',p_details=>true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '3' or r->'summary'->>'amount' is distinct from '-80.00' or r->>'total' is distinct from '3' then raise exception 'signed account type filtering failed';end if;
 r:=public.ar_aging_invoice_status(actor,p_accounts=>jsonb_build_array(jsonb_build_array('KAT',a),jsonb_build_array('TSK',a)),p_bucket=>b,p_dimension=>'billing',p_status=>'credit',p_details=>true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '2' or r->'summary'->>'amount' is distinct from '-70.00' or r->>'total' is distinct from '2'
  or (select count(distinct x->>'hotel') from jsonb_array_elements(r->'rows')x)<>2 then raise exception 'exact same-ID hotel members were merged or widened';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT','SYNTHETIC_NET_ZERO',a||'-NETZERO',null,b,null,null,true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '2' or r->'summary'->>'amount' is distinct from '0.00' or r->'summary'->>'creditAmount' is distinct from '100.00' or r->>'total' is distinct from '2' then raise exception 'net-zero account lost nonzero roots';end if;
 foreach dimension in array array['billing','followup','due'] loop
  if (select sum((f->>'count')::integer) from jsonb_array_elements(r->'summary'->dimension)f)<>2 or (select sum((f->>'amount')::numeric) from jsonb_array_elements(r->'summary'->dimension)f)<>0 then raise exception 'net-zero signed partition failed';end if;
 end loop;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=a and id='CREDIT-YOUNG';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete' is distinct from 'false' or r->'summary'->'count' is distinct from 'null'::jsonb or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'unknown credit was treated as verified zero';end if;
 update public.ar_invoices set verification_state='cleared' where hotel='KAT' and account_id=a and id='CREDIT-YOUNG';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete' is distinct from 'false' then raise exception 'cleared negative nonzero counted';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=a and id='CREDIT-YOUNG';
 update public.ar_refresh_state set last_success_at=null where hotel='TSK';
 r:=public.ar_aging_invoice_status(actor,p_type=>'SYNTHETIC_CREDIT_ONLY');
 if r->>'complete' is distinct from 'false' or r->'summary'->'count' is distinct from 'null'::jsonb then raise exception 'missing hotel publication counted credits';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '2' then raise exception 'unselected hotel publication affected credit scope';end if;
 if public.ar_aging_invoice_status(null,p_dimension=>'billing',p_status=>'credit')->>'error' is distinct from 'aging_forbidden'
  or public.ar_aging_invoice_status(gen_random_uuid(),p_dimension=>'due',p_status=>'credit')->>'error' is distinct from 'aging_forbidden' then raise exception 'credit filter bypassed actor authorization';end if;
 if public.ar_aging_invoice_status(actor,p_dimension=>'flags',p_status=>'credit')->>'error' is distinct from 'aging_invalid'
  or public.ar_aging_invoice_status(actor,p_dimension=>'billing',p_status=>'invalid')->>'error' is distinct from 'aging_invalid'
  or public.ar_aging_invoice_status(actor,p_dimension=>'due',p_status=>'credit',p_limit=>201)->>'error' is distinct from 'aging_invalid' then raise exception 'credit support weakened input validation';end if;
 if not has_function_privilege('service_role','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute')
  or has_function_privilege('anon','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute')
  or has_function_privilege('authenticated','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute') then raise exception 'signed RPC service-only privilege changed';end if;
end$$;
rollback;


