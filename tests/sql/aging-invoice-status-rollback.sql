-- Synthetic only; no provider data or effects. Entire fixture rolls back.
begin;
do $$
declare actor uuid;a text:='SYNTHETIC-AGING-'||gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;r jsonb;b jsonb:='["91 - 120",91,120,4]';p timestamptz:=now()-interval '1 hour';
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
 if r?'error' or r->>'complete'<>'true' or r->'summary'->>'count'<>'3' or r->'summary'->>'amount'<>'600.00' or r->'summary'->>'creditAmount'<>'50.00' or r->>'total'<>'3' or jsonb_array_length(r->'rows')<>1 then raise exception 'positive roots, credits, pagination or refresh freshness failed: %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r->'summary'->'billing')f where f->>'key'='unbilled' and f->>'count'='2') or not exists(select 1 from jsonb_array_elements(r->'summary'->'followup')f where f->>'key'='Follow 2' and f->>'count'='1') then raise exception 'independent workflow/manual facets failed: %',r;end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b,'due','past_due',true);
 if r->>'total'<>'1' or r->'rows'->0->>'invoiceId'<>'B' or r->'summary'->>'count'<>'3' then raise exception 'due filtering changed denominator';end if;
 r:=public.ar_aging_invoice_status(actor,p_accounts=>jsonb_build_array(jsonb_build_array('KAT',a)),p_details=>true,p_flag=>'held');
 if r->>'total'<>'0' or r->'summary'->>'count'<>'3' then raise exception 'exact members or independent flag denominator failed';end if;
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
 -- A known credit with unknown bucket never erases verified positive invoice counts.
 update public.ar_invoices set age=null where hotel='KAT' and account_id=a and id='CREDIT';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '3' or r->'summary'->>'amount' is distinct from '600.00' or r->'summary'->'creditAmount' is distinct from 'null'::jsonb then raise exception 'unknown credit placement invalidated positive counts or invented credit bucket';end if;
 if not exists(select 1 from jsonb_array_elements(r->'accounts'->0->'buckets')x where x->>'key' is not null and x->>'count'='3' and x->'creditAmount'='null'::jsonb) then raise exception 'bucket credit uncertainty lost';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'creditAmount' is distinct from '50.00' then raise exception 'unknown credit age erased known net credit';end if;
 update public.ar_invoices set age=100 where hotel='KAT' and account_id=a and id='CREDIT';
 -- Exact, verified zero-parent history is retained when that parent is absent.
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at)
 values('KAT',a,'HIST-CHILD',d-100,80,80,100,'verified','child',false,'ABSENT-PARENT','ABSENT-NO',0,p),
 ('KAT',a,'HIST-CREDIT',d-100,-20,-20,100,'verified','child',false,'ABSENT-PARENT','ABSENT-NO',0,p);
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,b);
 if r?'error' or r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '3' or r->'summary'->>'amount' is distinct from '600.00' or r->'summary'->>'creditAmount' is distinct from '50.00' then raise exception 'same-publication absent zero-parent children affected independent debt';end if;
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
 if r?'error' or r->>'complete'<>'true' or r->'summary'->>'count'<>'3' then raise exception 'unknown age removed positive net invoice';end if;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=a and id='A';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb then raise exception 'unverified source counted';end if;
 if public.ar_aging_invoice_status(gen_random_uuid())->>'error'<>'aging_forbidden' then raise exception 'actor check absent';end if;
 if public.ar_aging_invoice_status(actor,'KAT',null,null,a)->>'error'<>'aging_invalid' then raise exception 'cross hotel scope accepted';end if;
 if has_function_privilege('anon','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute') or has_function_privilege('authenticated','public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)','execute') then raise exception 'public RPC privilege leak';end if;
end$$;
rollback;





