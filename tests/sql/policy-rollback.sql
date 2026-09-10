-- Run against the newly seeded policy migration. All policy/source/mail rows roll back; no provider calls.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-POLICY-'||gen_random_uuid()::text;day date:=(now() at time zone 'Asia/Bangkok')::date;
 jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();first_mail uuid:=gen_random_uuid();custom_mail uuid:=gen_random_uuid();terminal_mail uuid:=gen_random_uuid();blocked_mail uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();cmd3 uuid:=gen_random_uuid();
 template_id uuid:=gen_random_uuid();template_content jsonb;original jsonb;rounds2 jsonb;rounds3 jsonb;input2 jsonb;input3 jsonb;r jsonb;expected jsonb;claim1 jsonb;claim2 jsonb;choice jsonb;w public.ar_invoice_workflow;rev integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved owner required';end if;
 original:=public.ar_collection_policy_get(actor,null);if original->>'version' is distinct from '1' then raise exception 'run initial policy fixture on seeded v1; later-policy regression needs an isolated clone';end if;
 if not ar_private.collection_policy_valid(original->'rounds') then raise exception 'default policy invalid';end if;
 r:=public.ar_collection_policy_get(gen_random_uuid(),null);if r->>'error' is distinct from 'policy_forbidden' then raise exception 'policy actor guard';end if;
 r:=public.ar_collection_policy_command_get(actor,cmd);if r->>'complete' is distinct from 'false' then raise exception 'unknown command receipt';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic policy Account','SYNTHETIC_POLICY',200,0,2,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,k,'Synthetic guest','INV-'||k,'FOL-'||k,day-40,100,100,'verified','standalone',false,now() from unnest(array['A','B'])k;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=day-20,last_reminder_stage='Follow 1',last_reminder_date=day-3 where hotel='KAT' and account_id=scope and invoice_id='A';
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(jid,actor,gen_random_uuid(),'KAT',scope,'Synthetic policy Account',array['A'],'invoices','separate','collection',jid::text,jsonb_build_array(jsonb_build_object('id','A','hotel','KAT','account_id',scope,'invoice_no','INV-A','open',100)),100,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"synthetic","byte_count":100,"sha256":"synthetic"}]',true);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(did,actor,jid,1,'KAT',scope,'Synthetic policy Account',array['A'],'collection','{"to":["proof@example.test"],"cc":[],"bcc":[]}','Synthetic policy proof','Synthetic body','[{"name":"Synthetic.pdf"}]');
 expected:='{"recipients":{"to":["proof@example.test"],"cc":[],"bcc":[]},"subject":"Synthetic policy proof","body":"Synthetic body"}';
 claim1:=public.ar_mail_claim(actor,first_mail,did,0,'send','Follow 2','<'||first_mail||'@ar-workspace.ar-c82.workers.dev>',expected);
 if claim1->>'claimed' is distinct from 'true' or claim1->>'collection_policy_version' is distinct from '1' or claim1->'stage_snapshot'->>'label' is distinct from 'Follow-up 2' or claim1->'stage_snapshot'->>'terminal' is distinct from 'false' then raise exception 'legacy default claim not captured';end if;
 -- Retire a pending stage, change its label/offset, add a replacement future round.
 select jsonb_agg(case when value->>'key'='Follow 2' then value||'{"active":false,"label":"Archived second follow-up","offsetDays":9}' else value end order by ordinality) into rounds2 from jsonb_array_elements(original->'rounds') with ordinality;
 rounds2:=(rounds2-4-3)||jsonb_build_array('{"key":"round_extra","label":"Additional follow-up","anchor":"previous_sent","offsetDays":3,"terminal":false,"active":true}'::jsonb,original->'rounds'->3,original->'rounds'->4);
 input2:=jsonb_build_object('commandId',cmd,'revision',1,'confirmed',true,'reason','Retire future use while preserving the pending message','rounds',rounds2);
 r:=public.ar_collection_policy_save(actor,input2);if r->>'version' is distinct from '2' then raise exception 'policy edit: %',r->>'error';end if;
 template_content:='{"name":"Synthetic custom round","purpose":"collection","stage":"round_extra","subject":"Synthetic message","richBody":{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Synthetic body"}]}]},"archived":false,"policyVersion":2}';
 r:=public.ar_template_save(actor,template_id,0,template_content||'{"policyVersion":1}');if r->>'error' is distinct from 'template_policy_revision_conflict' then raise exception 'stale template policy accepted';end if;
 r:=public.ar_template_save(actor,template_id,0,template_content-'policyVersion');if r->>'error' is distinct from 'template_policy_revision_conflict' then raise exception 'missing template policy accepted';end if;
 r:=public.ar_template_save(actor,gen_random_uuid(),0,template_content||'{"stage":"round_unregistered"}');if r->>'error' is distinct from 'template_invalid' then raise exception 'unregistered template stage accepted';end if;
 r:=public.ar_template_save(actor,gen_random_uuid(),0,template_content||'{"stage":"Follow 2"}');if r->>'error' is distinct from 'template_stage_retired' then raise exception 'retired active template accepted';end if;
 r:=public.ar_template_save(actor,gen_random_uuid(),0,template_content||'{"stage":"Follow 2","archived":true}');if r->>'revision' is distinct from '1' then raise exception 'archival template edit blocked';end if;
 r:=public.ar_template_save(actor,template_id,0,template_content);if r->>'revision' is distinct from '1' or r->>'stage' is distinct from 'round_extra' or r?'policyVersion' then raise exception 'custom template save fence/content';end if;
 if (select stage_snapshot from ar_private.mail_deliveries where id=first_mail) is distinct from claim1->'stage_snapshot' then raise exception 'pending stage interpretation changed';end if;
 r:=public.ar_mail_claim(actor,first_mail,did,0,'send','Follow 2','<'||first_mail||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'claimed' is distinct from 'false' or r->'stage_snapshot' is distinct from claim1->'stage_snapshot' then raise exception 'pending policy replay';end if;
 begin
  update ar_private.mail_deliveries set stage_snapshot=jsonb_set(stage_snapshot,'{label}','"Forged interpretation"') where id=first_mail;
  raise exception 'pending policy was mutable';
 exception when others then if sqlerrm<>'collection_claim_policy_immutable' then raise;end if;end;
 -- This call simulates the already verified SENT database transition; no email is sent by the fixture.
 r:=public.ar_mail_confirm_sent(actor,first_mail,'synthetic-policy-first-'||first_mail::text,now());if r->>'state' is distinct from 'sent' then raise exception 'retired pending stage cannot confirm';end if;
 select * into w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A';
 if w.last_reminder_stage<>'Follow 2' or w.last_reminder_policy_version<>1 or w.last_reminder_stage_snapshot->>'label'<>'Follow-up 2' or w.last_reminder_stage_snapshot->>'terminal'<>'false' or w.first_billing_date<>day-20 then raise exception 'SENT used current policy or changed billing date';end if;
 if (select stage_snapshot from public.ar_sent_events where delivery_id=first_mail) is distinct from claim1->'stage_snapshot' then raise exception 'event policy missing';end if;
 if (select details->'last_reminder_stage_snapshot' from ar_private.invoice_workflow_history where hotel='KAT' and account_id=scope and invoice_id='A' order by revision desc limit 1) is distinct from claim1->'stage_snapshot' then raise exception 'history policy missing';end if;
 update public.ar_email_drafts set revision=1 where id=did;
 r:=public.ar_mail_claim(actor,blocked_mail,did,1,'send','round_extra','<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_policy_revision_conflict' then raise exception 'missing reviewed policy version accepted';end if;
 r:=public.ar_mail_claim(actor,blocked_mail,did,1,'send','round_extra','<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":1}');if r->>'error' is distinct from 'email_policy_revision_conflict' then raise exception 'stale policy version accepted';end if;
 r:=public.ar_mail_claim(actor,blocked_mail,did,1,'send','Follow 2','<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":2}');if r->>'error' is distinct from 'email_stage_required' then raise exception 'retired new handoff accepted';end if;
 -- Registered custom stages work for explicit historical entry, with a policy snapshot.
 select revision into rev from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='B';
 r:=public.ar_workflow_history_save(actor,'KAT',scope,'B',rev,null,'round_extra',day);if r->>'last_reminder_stage' is distinct from 'round_extra' or r->>'last_reminder_policy_version' is distinct from '2' then raise exception 'custom stage workflow constraints/editor';end if;
 r:=public.ar_mail_claim(actor,custom_mail,did,1,'send','round_extra','<'||custom_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":2}');if r->>'claimed' is distinct from 'true' or r->'stage_snapshot'->>'label' is distinct from 'Additional follow-up' then raise exception 'custom active claim';end if;
 r:=public.ar_mail_confirm_sent(actor,custom_mail,'synthetic-policy-custom-'||custom_mail::text,now());if r->>'state' is distinct from 'sent' then raise exception 'custom active SENT';end if;
 select * into w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A';if w.last_reminder_stage<>'round_extra' or w.last_reminder_policy_version<>2 then raise exception 'custom workflow stage proof';end if;
 update public.ar_email_drafts set revision=2 where id=did;
 claim2:=public.ar_mail_claim(actor,terminal_mail,did,2,'send','Final','<'||terminal_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":2}');if claim2->>'claimed' is distinct from 'true' or claim2->'stage_snapshot'->>'terminal' is distinct from 'true' then raise exception 'terminal claim';end if;
 select jsonb_agg(case when value->>'key'='Final' then value||'{"active":false,"label":"Archived terminal"}' else value end order by ordinality) into rounds3 from jsonb_array_elements(rounds2) with ordinality;
 rounds3:=rounds3||'[{"key":"round_terminal","label":"New terminal round","anchor":"previous_sent","offsetDays":11,"terminal":true,"active":true}]';
 input3:=jsonb_build_object('commandId',cmd3,'revision',2,'confirmed',true,'reason','New terminal for future work','rounds',rounds3);
 r:=public.ar_collection_policy_save(actor,input3);if r->>'version' is distinct from '3' then raise exception 'third policy version';end if;
 r:=public.ar_mail_confirm_sent(actor,terminal_mail,'synthetic-policy-terminal-'||terminal_mail::text,now());if r->>'state' is distinct from 'sent' then raise exception 'old terminal SENT confirmation';end if;
 select * into w from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A';
 if w.last_reminder_policy_version<>2 or w.last_reminder_stage_snapshot->>'label'<>'Final' or w.last_reminder_stage_snapshot->>'terminal'<>'true' then raise exception 'historical terminal flag rewritten';end if;
 r:=public.ar_template_save(actor,template_id,0,template_content);if r->>'revision' is distinct from '1' then raise exception 'exact template retry after policy edit';end if;
 r:=public.ar_collection_policy_save(actor,input2);if r->>'version' is distinct from '2' or (select version from ar_private.collection_policy_head where singleton)<>3 then raise exception 'command replay must return its recorded version';end if;
 r:=public.ar_collection_policy_save(actor,input2||'{"reason":"Changed request"}');if r->>'error' is distinct from 'policy_command_conflict' then raise exception 'policy command conflict';end if;
 r:=public.ar_collection_policy_command_get(actor,cmd);if r->>'version' is distinct from '2' then raise exception 'policy receipt version';end if;
 r:=public.ar_collection_policy_save(actor,input3||jsonb_build_object('commandId',gen_random_uuid(),'revision',3,'rounds',rounds3-1));if r->>'error' is distinct from 'policy_retirement_required' then raise exception 'old key deletion accepted';end if;
 r:=public.ar_collection_policy_history(actor,1,1);if r->>'total' is distinct from '3' or r->'rows'->0->>'version' is distinct from '2' then raise exception 'policy history pagination';end if;
 begin update ar_private.collection_policy_versions set reason='rewritten' where version=1;raise exception 'policy history mutable';exception when others then if sqlerrm<>'collection_policy_evidence_immutable' then raise;end if;end;
 -- Outer exceptions, By System and thread fences still surround the changed deepest helper.
 r:=public.ar_invoice_exception_get(actor,'KAT',scope,'A');rev:=(r->>'revision')::integer;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',rev,'confirmed',true,'action','hold','reviewDate',null,'reason','Synthetic explicit hold'));rev:=(r->>'revision')::integer;
 update public.ar_email_drafts set revision=3 where id=did;
 r:=public.ar_mail_claim(actor,blocked_mail,did,3,'send','round_terminal','<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":3}');if r->>'error' is distinct from 'email_invoice_on_hold' then raise exception 'exception wrapper lost';end if;
 r:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',rev,'confirmed',true,'action','release','reason','Release synthetic hold'));
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,billing_recipients,collection_recipients,billing_method) values('KAT',scope,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','system');
 update public.ar_email_drafts set purpose='billing' where id=did;
 r:=public.ar_mail_claim(actor,blocked_mail,did,3,'draft',null,'<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected);if r->>'error' is distinct from 'email_system_billing_required' then raise exception 'By System validation lost';end if;
 update public.ar_email_drafts set purpose='collection' where id=did;
 choice:='{"threadId":"syntheticThread","parentMessageId":"syntheticParent","rfcMessageId":"<parent@example.test>","references":["<parent@example.test>"],"subject":"Synthetic policy proof","matchedRecipients":["proof@example.test"],"parentDate":"2026-09-10T00:00:00.000Z"}';
 r:=public.ar_email_thread_select(actor,did,3,choice);if r->>'revision' is distinct from '4' then raise exception 'thread fixture selection';end if;
 r:=public.ar_mail_claim(actor,blocked_mail,did,4,'send','round_terminal','<'||blocked_mail||'@ar-workspace.ar-c82.workers.dev>',expected||'{"policyVersion":3}');if r->>'error' is distinct from 'email_thread_changed' then raise exception 'thread wrapper lost';end if;
 if has_function_privilege('service_role','ar_private.template_save_before_policy(uuid,uuid,integer,jsonb)','execute') or has_function_privilege('authenticated','public.ar_collection_policy_save(uuid,jsonb)','execute') or has_table_privilege('authenticated','ar_private.collection_policy_versions','update') or has_function_privilege('service_role','ar_private.mail_claim_before_threads(uuid,uuid,uuid,integer,text,text,text,jsonb)','execute') then raise exception 'policy/claim private grants';end if;
 if (select count(*) from public.ar_sent_events where hotel='KAT' and account_id=scope)<>3 then raise exception 'only synthetic sent transitions expected';end if;
 r:=public.ar_reports_read(actor,'activity','KAT',scope);
 if r->>'total'<>'3' or not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'kind'='round_extra' and x->>'stage_label'='Additional follow-up') then raise exception 'activity lost captured custom label';end if;
 r:=public.ar_reports_read(actor,'current','KAT',scope);
 if r->'summary'->>'urgent'<>'1' or not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'id'='A' and x->>'latest_stage_label'='Final' and x->>'latest_terminal'='true') then raise exception 'report reinterpreted historical terminal';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'history',0,100);
 if (select count(*) from jsonb_array_elements(r->'rows') x where x->>'source'='Verified Gmail send')<>3 or exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'source'='Manual history correction' and x->'invoice_ids'?'A') then raise exception 'Gmail workflow audit duplicated as manual history';end if;
 if not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'stage'='Final' and x->'stage_snapshot'->>'label'='Final' and x->'stage_snapshot'->>'policyVersion'='2') then raise exception 'account history lost immutable stage label';end if;
end $$;
rollback;
select 'collection policy synthetic behavior passed; all rows rolled back' as result;
