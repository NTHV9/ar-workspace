begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-BULK-'||gen_random_uuid();kind text:='SYNTHETIC-TYPE-'||gen_random_uuid();input jsonb;plan jsonb;r jsonb;again jsonb;cmd uuid:=gen_random_uuid();empty jsonb:='{"to":[],"cc":[],"bcc":[]}';ph uuid:=gen_random_uuid();before_rev integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic shared name',kind,100,0,1,'verified'),('TLKL',scope,'Synthetic shared name',kind,100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'A','2026-09-01',100,100,'verified','standalone',false,now()),('TLKL',scope,'A','2026-09-01',100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":["saved@example.invalid"],"cc":[],"bcc":[]}',empty,'{"billingInstructions":"Keep this"}');
 input:=jsonb_build_object('mode','accounts','accounts',jsonb_build_array(jsonb_build_object('hotel','KAT','accountId',scope,'revision',1),jsonb_build_object('hotel','TLKL','accountId',scope,'revision',0)),'types','[]'::jsonb,'patch',jsonb_build_object('billingRequired',false,'creditTerm',14));
 plan:=public.ar_bulk_settings_preview(actor,input);if plan?'error' or (plan->>'accountCount')::int<>2 or (plan->>'invoiceCount')::int<>2 then raise exception 'bulk preview failed: %',plan;end if;
 input:=plan-array['rows','accountCount','invoiceCount','changedCount','defaultsCount'];r:=public.ar_bulk_settings_apply(actor,input,cmd);if r->>'saved' is distinct from 'true' then raise exception 'bulk save failed: %',r;end if;
 if exists(select 1 from public.ar_invoice_workflow where account_id=scope and (billing_required is distinct from false or credit_term<>14 or due_date<>'2026-09-15')) then raise exception 'bulk rules did not reach invoices';end if;
 if not exists(select 1 from public.ar_account_settings where hotel='KAT' and account_id=scope and billing_recipients->'to'='["saved@example.invalid"]' and billing_instructions='Keep this') then raise exception 'unchecked fields overwritten';end if;
 again:=public.ar_bulk_settings_apply(actor,input,cmd);if again->>'replayed' is distinct from 'true' then raise exception 'retry did not replay';end if;
 r:=public.ar_bulk_settings_apply(actor,jsonb_set(input,'{patch,creditTerm}','15'),cmd);if r->>'error' is distinct from 'bulk_settings_command_conflict' then raise exception 'command reused with different values';end if;
 -- A stale second target must roll back every earlier update.
 plan:=public.ar_bulk_settings_preview(actor,input);input:=plan-array['rows','accountCount','invoiceCount','changedCount','defaultsCount'];input:=jsonb_set(input,'{patch,creditTerm}','21');
 select revision into before_rev from public.ar_account_settings where hotel='KAT' and account_id=scope;
 perform public.ar_settings_save_v2(actor,'TLKL',scope,1,false,10,empty,empty,'{}');
 r:=public.ar_bulk_settings_apply(actor,input,gen_random_uuid());if r->>'error' is distinct from 'bulk_settings_conflict' or exists(select 1 from public.ar_account_settings where hotel='KAT' and account_id=scope and (revision<>before_rev or credit_term<>14)) then raise exception 'partial stale batch committed';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope||'-PENDING','Synthetic unconfigured account',kind,100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope||'-PENDING','P','2026-09-01',100,100,'verified','standalone',false,now());
 -- Type rules cover current Accounts and initialize only new Accounts in those hotel/type pairs.
 input:=jsonb_build_object('mode','types','accounts','[]'::jsonb,'types',jsonb_build_array(jsonb_build_object('hotel','KAT','type',kind,'revision',0)),'patch',jsonb_build_object('billingRequired',true,'creditTerm',45,'billingMethod','system','billingPortal','https://billing.example.invalid','collectionInstructions','Use a reference','collectionRecipients',jsonb_build_object('to',jsonb_build_array('team@example.invalid'),'cc','[]'::jsonb,'bcc','[]'::jsonb)));
 plan:=public.ar_bulk_settings_preview(actor,input);input:=plan-array['rows','accountCount','invoiceCount','changedCount','defaultsCount'];r:=public.ar_bulk_settings_apply(actor,input,gen_random_uuid());if r->>'saved' is distinct from 'true' then raise exception 'type apply failed: %',r;end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope||'-NEW','Synthetic arrival',kind,100,0,1,'verified'),('TSK',scope||'-NEW','Synthetic other hotel',kind,100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope||'-NEW','N','2026-09-02',100,100,'verified','standalone',false,now());
 if not exists(select 1 from public.ar_account_settings where hotel='KAT' and account_id=scope||'-NEW' and from_type_defaults and billing_required and credit_term=45 and billing_method='system' and billing_portal='https://billing.example.invalid' and collection_instructions='Use a reference' and collection_recipients->'to'='["team@example.invalid"]') then raise exception 'new account did not inherit complete default';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope||'-PENDING' and billing_required and credit_term=45 and account_setup_required) then raise exception 'existing fallback did not retain Setup Needed';end if;
 if not exists(select 1 from public.ar_collection_rows where hotel='KAT' and account_id=scope||'-PENDING' and workflow->>'account_setup_required'='true') then raise exception 'queue projection lost Setup Needed';end if;
 if exists(select 1 from public.ar_account_settings where hotel='TSK' and account_id=scope||'-NEW') then raise exception 'defaults crossed hotel';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope||'-NEW' and invoice_id='N' and account_setup_required and billing_required and credit_term=45 and due_date is null) then raise exception 'new invoice inheritance wrong';end if;
 if not exists(select 1 from public.ar_account_settings where hotel='KAT' and account_id=scope and not from_type_defaults and billing_required=false and credit_term=14) then raise exception 'type defaults overwrote explicit Account rules';end if;
 -- Saving unchanged inherited values explicitly confirms an Account and clears Setup Needed.
 r:=public.ar_settings_get('KAT',scope||'-NEW');
 r:=public.ar_settings_save_v2(actor,'KAT',scope||'-NEW',1,true,45,r->'billing_recipients',r->'collection_recipients',jsonb_build_object('billingMethod','system','billingPortal',r->'billing_portal','billingInstructions',r->'billing_instructions','collectionInstructions',r->'collection_instructions'));
 if r?'error' or r->>'from_type_defaults' is distinct from 'false' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope||'-NEW' and account_setup_required) then raise exception 'explicit confirmation did not clear Setup Needed: %',r;end if;
 -- New membership since review invalidates the previously reviewed group.
 r:=public.ar_bulk_settings_apply(actor,input,gen_random_uuid());if r->>'error' not in('bulk_settings_conflict','bulk_settings_membership_changed') then raise exception 'changed type membership accepted';end if;
 update public.ar_accounts set name='Synthetic refreshed name' where hotel='KAT' and id=scope||'-NEW';
 if (select revision from public.ar_account_settings where hotel='KAT' and account_id=scope||'-NEW')<>2 then raise exception 'refresh reapplied type settings';end if;
 input:=jsonb_build_object('mode','types','accounts','[]'::jsonb,'types',jsonb_build_array(jsonb_build_object('hotel','KAT','type',kind,'revision',1)),'patch',jsonb_build_object('creditTerm',60));
 plan:=public.ar_bulk_settings_preview(actor,input);input:=plan-array['rows','accountCount','invoiceCount','changedCount','defaultsCount'];r:=public.ar_bulk_settings_apply(actor,input,gen_random_uuid());
 if r->>'saved' is distinct from 'true' then raise exception 'later type edit failed';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope||'-PENDING' and credit_term=60 and account_setup_required) then raise exception 'unconfirmed account did not follow edited type default';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope||'-NEW' and credit_term=45 and not account_setup_required) then raise exception 'type edit overwrote confirmed Account';end if;
 perform public.ar_access_save(actor,gen_random_uuid(),'synthetic.bulk.phuket@example.invalid',array['phuket'],true,0);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(ph,'synthetic.bulk.phuket@example.invalid',now(),false);
 r:=public.ar_bulk_settings_catalog(ph);if exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'hotel' not in('KAT','TSK')) then raise exception 'catalog leaked regional accounts';end if;
 r:=public.ar_bulk_settings_preview(ph,jsonb_build_object('mode','accounts','accounts',jsonb_build_array(jsonb_build_object('hotel','TLKL','accountId',scope,'revision',2)),'types','[]'::jsonb,'patch',jsonb_build_object('creditTerm',7)));if r->>'error' is distinct from 'access_forbidden' then raise exception 'cross-region preview allowed';end if;
 if has_function_privilege('authenticated','public.ar_bulk_settings_apply(uuid,jsonb,uuid)','execute') or has_table_privilege('service_role','ar_private.account_type_defaults','select') then raise exception 'bulk private boundary exposed';end if;
 if exists(select 1 from public.ar_sent_events where account_id like scope||'%') then raise exception 'bulk settings sent email';end if;
end $$;
rollback;
