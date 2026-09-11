-- Synthetic scope only. Run after the draft migration is reviewed/applied; never sends provider requests.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-EXCEPTION-'||gen_random_uuid()::text;day date:=(now() at time zone 'Asia/Bangkok')::date;
 r jsonb;input jsonb;hold_input jsonb;hold_result jsonb;hold_cmd uuid:=gen_random_uuid();first_cmd uuid:=gen_random_uuid();rev integer;before_history jsonb;after_history jsonb;
 jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();blocked_id uuid:=gen_random_uuid();expected jsonb;choice jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved identity required';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic exception Account','SYNTHETIC_EXCEPTION',100,0,5,'verified'),('TSK',scope,'Synthetic second hotel','SYNTHETIC_EXCEPTION',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,x.id,'Synthetic guest','INV-'||x.id,'FOL-'||x.id,day-20,100,x.amount,x.state,'standalone',false,now()
 from(values('A',100::numeric,'verified'),('B',0,'cleared'),('U',0,'unknown'),('M',0,'missing'),('Z',0,'verified'))x(id,amount,state);
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('TSK',scope,'A','Synthetic second guest','INV-A','FOL-A',day-20,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=day-10,last_reminder_stage='Follow 2',last_reminder_date=day-3 where hotel='KAT' and account_id=scope and invoice_id='A';
 select to_jsonb(w) into before_history from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A';
 r:=public.ar_invoice_exception_get(actor,'KAT',scope,'A');if r->>'revision' is distinct from '0' or r->'source'->>'open' is distinct from '100.00' then raise exception 'default read';end if;
 r:=public.ar_invoice_exception_get(gen_random_uuid(),'KAT',scope,'A');if r->>'error' is distinct from 'exception_forbidden' then raise exception 'actor read guard';end if;
 r:=public.ar_invoice_exception_command_get(actor,first_cmd);if r->>'complete' is distinct from 'false' then raise exception 'absent command is unknown';end if;
 input:=jsonb_build_object('commandId',first_cmd,'revision',99,'confirmed',true,'action','set_notes','reason','Synthetic source review','note','Review the invoice','dispute','Customer requested checking supporting proof');
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',input);if r->>'error' is distinct from 'exception_revision_conflict' or exists(select 1 from public.ar_invoice_exceptions where account_id=scope) then raise exception 'failed revision wrote state';end if;
 input:=jsonb_set(input,'{revision}','0');
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',input);if r->>'revision' is distinct from '1' or r->>'held' is distinct from 'false' or r->>'dispute' is distinct from 'Customer requested checking supporting proof' then raise exception 'notes must not infer hold';end if;
 hold_input:=jsonb_build_object('commandId',hold_cmd,'revision',1,'confirmed',true,'action','hold','reason','Wait for explicitly reviewed evidence','reviewDate',day+7);
 hold_result:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',hold_input);if hold_result->>'revision' is distinct from '2' or hold_result->>'held' is distinct from 'true' then raise exception 'hold command';end if;
 r:=public.ar_invoice_exception_get(actor,'TSK',scope,'A');if r->>'held' is distinct from 'false' or r->>'revision' is distinct from '0' then raise exception 'cross-hotel bleed';end if;
 r:=public.ar_invoice_exception_command(actor,'TSK',scope,'A',hold_input);if r->>'error' is distinct from 'exception_command_conflict' then raise exception 'cross-hotel replay';end if;
 if (select to_jsonb(w) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A') is distinct from before_history or (select open from public.ar_invoices where hotel='KAT' and account_id=scope and id='A')<>100 then raise exception 'hold changed history or money';end if;

 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(jid,actor,gen_random_uuid(),'KAT',scope,'Synthetic exception Account',array['A'],'invoices','separate','collection',jid::text,'[{"id":"A","invoice_no":"INV-A","folio_no":"FOL-A","open":100}]',100,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"synthetic","byte_count":100,"sha256":"synthetic"}]',true);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(did,actor,jid,1,'KAT',scope,'Synthetic exception Account',array['A'],'collection','{"to":["proof@example.test"],"cc":[],"bcc":[]}','Synthetic exception proof','Synthetic body','[{"name":"Synthetic.pdf"}]');
 expected:='{"recipients":{"to":["proof@example.test"],"cc":[],"bcc":[]},"subject":"Synthetic exception proof","body":"Synthetic body"}';
 r:=public.ar_mail_claim(actor,blocked_id,did,0,'send','Follow 3','<'||blocked_id||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_invoice_on_hold' or exists(select 1 from ar_private.mail_deliveries where id=blocked_id) then raise exception 'held new handoff';end if;
 r:=public.ar_gmail_attempt_claim(actor,did,0,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>');if r->>'error' is distinct from 'email_invoice_on_hold' then raise exception 'legacy held handoff';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',2,'confirmed',true,'action','release','reason','Evidence checked'));if r->>'held' is distinct from 'false' or r->>'revision' is distinct from '3' then raise exception 'release';end if;
 r:=public.ar_mail_claim(actor,mid,did,0,'send','Follow 3','<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'claimed' is distinct from 'true' then raise exception 'unheld valid claim: %',r->>'error';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',3,'confirmed',true,'action','hold','reviewDate',null,'reason','New evidence after handoff'));if r->>'revision' is distinct from '4' then raise exception 'post-handoff hold';end if;
 r:=public.ar_mail_claim(actor,mid,did,0,'send','Follow 3','<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'claimed' is distinct from 'false' then raise exception 'existing claim must remain replayable';end if;
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=scope and id='A';
 update public.ar_invoices set open=75,verification_state='verified' where hotel='KAT' and account_id=scope and id='A';
 if (select to_jsonb(w) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A') is distinct from before_history then raise exception 'reopen mutated pre-send history';end if;
 -- Synthetic proof only: actual Worker calls this after verified SENT. A later hold cannot erase that fact.
 r:=public.ar_mail_confirm_sent(actor,mid,'synthetic-exception-sent-'||mid::text,now());if r->>'state' is distinct from 'sent' or r->>'recorded' is distinct from 'true' then raise exception 'later hold/reopen blocked sent fact';end if;
 select to_jsonb(w) into after_history from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A';
 if after_history->>'first_billing_date' is distinct from before_history->>'first_billing_date' or after_history->>'last_reminder_stage' is distinct from 'Follow 3' then raise exception 'sent history transition';end if;

 r:=public.ar_invoice_exception_get(actor,'KAT',scope,'A');if r->>'needsReview' is distinct from 'true' or r->>'held' is distinct from 'true' or r->>'revision' is distinct from '5' or r->'source'->>'open' is distinct from '75.00' then raise exception 'verified reopen metadata';end if;
 if (select to_jsonb(w) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A') is distinct from after_history then raise exception 'reopen changed historical workflow';end if;
 r:=public.ar_invoice_exception_history(actor,'KAT',scope,'A',0,2);if r->>'total' is distinct from '5' or jsonb_array_length(r->'rows')<>2 or r->'rows'->0->'transition'->>'fromOpen' is distinct from '0.00' or r->'rows'->0->'transition'->>'toOpen' is distinct from '75.00' or r->'rows'->0->'snapshot'->>'needsReview' is distinct from 'true' or r->'rows'->0->'snapshot'->'source'->>'open' is distinct from '75.00' then raise exception 'source reopen audit';end if;
 update public.ar_email_drafts set revision=1 where id=did;
 r:=public.ar_mail_claim(actor,blocked_id,did,1,'draft','Follow 3','<'||blocked_id||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_invoice_review_required' then raise exception 'reopen new handoff fence';end if;
 update public.ar_invoices set verification_state='missing' where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_invoice_exception_get(actor,'KAT',scope,'A');if r->'source'->'open' is distinct from 'null'::jsonb then raise exception 'missing source became known money';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',5,'confirmed',true,'action','acknowledge_reopen','reason','Cannot acknowledge missing source'));if r->>'error' is distinct from 'exception_source_unverified' then raise exception 'unverified acknowledgement';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',5,'confirmed',true,'action','acknowledge_reopen','reason','Reviewed reopened source and retained history'));if r->>'needsReview' is distinct from 'false' or r->>'held' is distinct from 'true' or r->>'revision' is distinct from '6' then raise exception 'review must not release hold';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',6,'confirmed',true,'action','release','reason','Resume explicit work'));if r->>'revision' is distinct from '7' then raise exception 'second release';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',hold_input);if r is distinct from hold_result or (select revision from public.ar_invoice_exceptions where hotel='KAT' and account_id=scope and invoice_id='A')<>7 then raise exception 'exact command replay mutated later revision';end if;
 update public.ar_invoices set open=100,verification_state='verified' where hotel='KAT' and account_id=scope and id in('U','M');
 if exists(select 1 from public.ar_invoice_exceptions where hotel='KAT' and account_id=scope and invoice_id in('U','M')) then raise exception 'unknown/missing was inferred as verified zero';end if;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=scope and id='B';
 update public.ar_invoices set open=50,verification_state='verified' where hotel='KAT' and account_id=scope and id='B';
 if not exists(select 1 from public.ar_invoice_exceptions where hotel='KAT' and account_id=scope and invoice_id='B' and needs_review) then raise exception 'intermediate unknown lost prior verified zero';end if;
 if exists(select 1 from ar_private.invoice_verified_balances where hotel='KAT' and account_id=scope and invoice_id='B' and zero_since is not null) then raise exception 'reopened invoice retained deletion clock';end if;
 update public.ar_invoices set open=-1,verification_state='verified' where hotel='KAT' and account_id=scope and id='Z';
 update public.ar_invoices set open=-1,verification_state='verified' where hotel='KAT' and account_id=scope and id='Z';
 if (select revision from public.ar_invoice_exceptions where hotel='KAT' and account_id=scope and invoice_id='Z')<>1 then raise exception 'verified nonzero or repeated refresh';end if;

 -- Nested thread/By System behavior remains authoritative after exception release.
 update public.ar_email_drafts set purpose='billing' where id=did;
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,billing_recipients,collection_recipients,billing_method) values('KAT',scope,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','system');
 r:=public.ar_mail_claim(actor,blocked_id,did,1,'draft',null,'<'||blocked_id||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_system_billing_required' then raise exception 'By System guard lost';end if;
 update public.ar_account_settings set billing_method='email' where hotel='KAT' and account_id=scope;
 choice:='{"threadId":"syntheticThread","parentMessageId":"syntheticParent","rfcMessageId":"<parent@example.test>","references":["<parent@example.test>"],"subject":"Synthetic exception proof","matchedRecipients":["proof@example.test"],"parentDate":"2026-09-10T00:00:00.000Z"}';
 r:=public.ar_email_thread_select(actor,did,1,choice);if r->>'revision' is distinct from '2' then raise exception 'thread fixture selection';end if;
 r:=public.ar_mail_claim(actor,blocked_id,did,2,'draft',null,'<'||blocked_id||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_thread_changed' then raise exception 'thread guard lost';end if;
 if has_function_privilege('authenticated','public.ar_invoice_exception_command(uuid,text,text,text,jsonb)','execute') or has_table_privilege('authenticated','public.ar_invoice_exceptions','update') or has_function_privilege('service_role','ar_private.mail_claim_before_exceptions(uuid,uuid,uuid,integer,text,text,text,jsonb)','execute') then raise exception 'private guard bypass';end if;
 if exists(select 1 from public.ar_sent_events where hotel='TSK' and account_id=scope) or (select count(*) from public.ar_sent_events where hotel='KAT' and account_id=scope)<>1 then raise exception 'synthetic event scope';end if;
end $$;
rollback;
select 'invoice exceptions synthetic behavior passed; all rows rolled back' as result;
