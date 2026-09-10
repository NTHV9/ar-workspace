-- Pre-import verification: requires an unconfigured account with a reviewed job; fails explicitly once no such fixture is available.
begin;
do $$
declare actor uuid;a public.ar_accounts;r jsonb;d jsonb;w_before integer;events_before integer;delivery_id uuid:=gen_random_uuid();
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select a1.* into a from public.ar_accounts a1 join public.ar_document_jobs j on j.hotel=a1.hotel and j.account_id=a1.id where j.owner=actor and j.acknowledged and j.state='ready' and not exists(select 1 from public.ar_account_settings s where s.hotel=a1.hotel and s.account_id=a1.id) and not exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts ed on ed.id=g.draft_id where ed.hotel=a1.hotel and ed.account_id=a1.id and g.state in ('creating','created','uncertain')) limit 1;
 if a.id is null then raise exception 'unconfigured reviewed account needed';end if;
 select count(*) into events_before from public.ar_sent_events;
 select public.ar_email_open(actor,j.id,j.revision) into d from public.ar_document_jobs j where j.hotel=a.hotel and j.account_id=a.id and j.owner=actor and j.acknowledged and j.state='ready' limit 1;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(delivery_id,actor,(d->>'id')::uuid,(d->>'revision')::int,'draft','<'||delivery_id||'@ar-workspace.ar-c82.workers.dev>','{}','created');
 r:=public.ar_settings_save_v2(actor,a.hotel,a.id,0,true,0,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{"billingMethod":"system"}');
 if r->>'error' is distinct from 'settings_billing_handoff_pending' or exists(select 1 from public.ar_account_settings where hotel=a.hotel and account_id=a.id) then raise exception 'first initialization bypassed pending handoff';end if;
 delete from ar_private.mail_deliveries where id=delivery_id;
 r:=public.ar_settings_save_v2(actor,a.hotel,a.id,0,true,0,'{"to":[],"cc":[],"bcc":[]}','{"to":["collect@example.test"],"cc":[],"bcc":[]}','{"billingMethod":"system","billingPortal":"https://portal.example.test/","billingInstructions":"Synthetic portal note","collectionInstructions":"Synthetic follow-up note"}');
 if r?'error' or r->>'billing_method' is distinct from 'system' or (r->>'credit_term')::integer is distinct from 0 then raise exception 'system settings save failed: %',r->>'error';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel=a.hotel and account_id=a.id and settings_revision is not null and (not billing_required or credit_term<>0 or first_billing_date is not null or due_date is not null or last_reminder_stage is not null)) then raise exception 'initial rules or historical dates changed incorrectly';end if;
 r:=public.ar_settings_save_v2(actor,a.hotel,a.id,1,true,0,r->'billing_recipients',r->'collection_recipients','{}');if r->>'billing_method' is distinct from 'system' or r->>'revision' is distinct from '1' then raise exception 'legacy request erased method or no-op revision changed';end if;
 r:=public.ar_settings_save_v2(gen_random_uuid(),a.hotel,a.id,1,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');if r->>'error' is distinct from 'settings_forbidden' then raise exception 'actor check';end if;
 select public.ar_email_open(actor,j.id,j.revision) into d from public.ar_document_jobs j where j.hotel=a.hotel and j.account_id=a.id and j.owner=actor and j.acknowledged and j.state='ready' limit 1;
 if d?'error' or d->>'billing_method' is distinct from 'system' then raise exception 'draft did not expose method';end if;
 r:=public.ar_mail_claim(actor,delivery_id,(d->>'id')::uuid,(d->>'revision')::integer,'draft',null,'<'||delivery_id||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('recipients',d->'recipients','subject',d->>'subject','body',d->>'body','richBody',d->'rich_body'));
 if r->>'error' is distinct from 'email_system_billing_required' then raise exception 'data layer accepted System billing claim: %',r->>'error';end if;
 r:=public.ar_gmail_attempt_claim(actor,(d->>'id')::uuid,(d->>'revision')::integer,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>');if r->>'error' is distinct from 'email_system_billing_required' then raise exception 'legacy helper bypassed channel';end if;
 if events_before<>(select count(*) from public.ar_sent_events) then raise exception 'unexpected send event';end if;
 if has_function_privilege('authenticated','public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb)','execute') or has_function_privilege('service_role','public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)','execute') then raise exception 'writer privilege';end if;
end $$;
rollback;
