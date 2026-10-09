-- Entirely synthetic. Run under rollback after migration109.
begin;
do $$
declare actor uuid:=ar_private.access_owner();a text:='SYNTHETIC_DRF_109';d date:=(now() at time zone 'Asia/Bangkok')::date;p timestamptz:=clock_timestamp();j uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();r jsonb;b jsonb;before_money jsonb;report_before jsonb;delivery uuid:=gen_random_uuid();
begin
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at,"agingBuckets") values('KAT',a,'Synthetic DRF','CCR',95,0,2,'verified',p,'[{"label":"61+","start":0,"end":null,"sequence":1,"amount":95,"debit":95,"credit":0}]');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values('KAT',a,'DEBIT',d-70,100,100,70,'verified','standalone',false,p),('KAT',a,'CREDIT',d-70,-5,-5,70,'verified','standalone',false,p);
 update public.ar_refresh_state set status='succeeded',last_success_at=p where hotel='KAT';
 update public.ar_invoice_workflow set billing_required=null,credit_term=null where hotel='KAT' and account_id=a;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state) values(j,actor,gen_random_uuid(),'KAT',a,'Synthetic DRF',array['DEBIT'],'statement','combined','billing','synthetic','[{"id":"DEBIT","open":100}]',100,'ready');
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,exports) values(draft,actor,j,0,'KAT',a,'Synthetic DRF',array['DEBIT'],'billing','{"to":[],"cc":[],"bcc":[]}','[]');
 r:=public.ar_dashboard_balances(actor,d,'KAT',a);before_money:=r->'openBalanceBreakdown';
 report_before:=public.ar_reports_read(actor,'current','KAT',a);
 if public.ar_email_business_preflight(actor,draft)->>'allowed'<>'true' then raise exception 'nonDRF preflight rejected';end if;
 update public.ar_accounts set type='DRF' where hotel='KAT' and id=a;
 if exists(select 1 from public.ar_collection_rows where hotel='KAT' and account_id=a) then raise exception 'DRF entered collection queue';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',a);
 if r->>'complete'<>'true' or r->>'total'<>'2' or r->'openBalanceBreakdown' is distinct from before_money then raise exception 'DRF money inventory changed: %',r;end if;
 for b in select value from jsonb_array_elements(r->'metrics') loop
 if b->>'key'='open' and b->>'amount'<>'95.00' or b->>'key'='over60' and b->>'amount'<>'100.00' or b->>'key' not in('open','over60') and b->>'count'<>'0' then raise exception 'DRF operational metric/money: %',b;end if;
 end loop;
 if public.ar_dashboard_balances(actor,d,'KAT',a,null,'past_due')->>'total'<>'0' or public.ar_dashboard_balances(actor,d,'KAT',a,null,null,'Final')->>'total'<>'0' then raise exception 'DRF operational detail entered';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,null,null,null,true);
 if r->>'complete'<>'true' or r->'summary'->>'count'<>'2' or r->'summary'->>'amount'<>'95.00' or r->'accounts'->0->'membership'->>'state'<>'resolved' then raise exception 'DRF aging money/member proof: %',r;end if;
 if exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'billingStatus'<>'balance_only' or x->>'latestStage'<>'balance_only' or x->>'dueStatus'<>'balance_only') then raise exception 'DRF aging operational status';end if;
 foreach b in array array['"billing"'::jsonb,'"followup"'::jsonb,'"due"'::jsonb] loop
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,null,b#>>'{}','balance_only',true);
 if r->>'complete'<>'true' or r->>'total'<>'2' then raise exception 'DRF aging facet query failed: %',r;end if;
 end loop;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=a;
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',a);
 if r->>'complete'<>'true' or r->>'cohortComplete'<>'true' or r->'hotels'->0->>'amount'<>'95.00' or r->'hotels'->0->>'unbilled61'<>'0' or r->'accountsOver60'->0->>'amount'<>'100.00' or r->'accountsOver60'->0->>'unbilled'<>'0' or r->'accountsOver60'->0->>'unbilledAmount'<>'0.00' then raise exception 'DRF management money/operational counters: %',r;end if;
 for b in select value from jsonb_array_elements(r->'cohort') loop
 if b->>'key'='issued' and (b->>'count'<>'2' or b->>'amount'<>'95.00') or b->>'key' in('billed','unbilled','not_required','setup') and b->>'count'<>'0' then raise exception 'DRF management operational cohort: %',b;end if;
 end loop;
 r:=public.ar_reports_read(actor,'current','KAT',a);
 if r->>'total' is distinct from report_before->>'total' or r->'summary'->>'amount' is distinct from report_before->'summary'->>'amount' or r->'summary'->>'invoices' is distinct from report_before->'summary'->>'invoices' or r->'summary'->>'unbilled'<>'0' or r->'summary'->>'urgent'<>'0' or r->'summary'->'stages'<>'[]'::jsonb then raise exception 'DRF report money/operational projection: %',r;end if;
 if public.ar_email_business_preflight(actor,draft)->>'error'<>'account_balance_only' or public.ar_email_business_preflight(gen_random_uuid(),draft)->>'error'<>'email_forbidden' then raise exception 'DRF preflight bypass';end if;
 if public.ar_document_create_v5(actor,gen_random_uuid(),'KAT',a,array['DEBIT'],'statement','combined','billing','workspace')->>'error'<>'account_balance_only' then raise exception 'DRF document creation accepted';end if;
 if public.ar_mail_claim(actor,delivery,draft,0,'send',null,'synthetic','{"mailbox":"phuket","sender":"ar@katathani.com"}')->>'error'<>'account_balance_only' or public.ar_gmail_attempt_claim(actor,draft,0,'synthetic')->>'error'<>'account_balance_only' then raise exception 'DRF fresh mail accepted';end if;
 if public.ar_external_billing_preview(actor,jsonb_build_object('commandId',gen_random_uuid(),'action','record','hotel','KAT','accountId',a))->>'error'<>'billing_balance_only' then raise exception 'DRF external billing accepted';end if;
 if public.ar_external_billing_save(actor,jsonb_build_object('commandId',gen_random_uuid(),'action','record','hotel','KAT','accountId',a,'lines','[]'::jsonb),'synthetic')->>'error'<>'billing_balance_only' then raise exception 'DRF external billing save accepted';end if;
 if has_function_privilege('authenticated','public.ar_email_business_preflight(uuid,uuid)','execute') or has_function_privilege('service_role','ar_private.balance_only_account(text,text)','execute') then raise exception 'DRF private guard grant leak';end if;
end$$;
rollback;
