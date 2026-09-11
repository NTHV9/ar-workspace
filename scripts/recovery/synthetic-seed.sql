-- Persistent synthetic data for the local logical dump/restore drill. No provider call.
insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,account_no)
values('KAT','SYNTHETIC-RESTORE-ACCOUNT','Synthetic restore account','SYNTHETIC_RESTORE',10000,0,1,'verified','SYNTHETIC');
insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
values('KAT','SYNTHETIC-RESTORE-ACCOUNT','SYNTHETIC-RESTORE-INVOICE','Synthetic guest','SYNTHETIC-INV','SYNTHETIC-FOL',current_date-10,10000,10000,'verified','standalone',false,now());
insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','KAT','SYNTHETIC-RESTORE-ACCOUNT','Synthetic restore account',array['SYNTHETIC-RESTORE-INVOICE'],'invoices','separate','billing','synthetic-restore-job','[{"id":"SYNTHETIC-RESTORE-INVOICE","open":10000}]',10000,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"synthetic/restore.pdf","byte_count":622,"sha256":"synthetic"}]',true);

do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001';delivery uuid:='00000000-0000-4000-8000-000000000013';d jsonb;r jsonb;expected jsonb;
begin
 r:=public.ar_settings_save_v2(actor,'KAT','SYNTHETIC-RESTORE-ACCOUNT',0,true,30,'{"to":["synthetic@example.test"],"cc":[],"bcc":[]}','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}','{"billingMethod":"email","billingInstructions":"Synthetic recovery only","collectionInstructions":"Synthetic recovery only"}');
 if r?'error' then raise exception 'synthetic settings failed: %',r->>'error';end if;
 d:=public.ar_email_open(actor,'00000000-0000-4000-8000-000000000010',1);if d?'error' then raise exception 'synthetic draft failed: %',d->>'error';end if;
 d:=public.ar_email_save_v2(actor,(d->>'id')::uuid,(d->>'revision')::integer,'billing','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}','Synthetic restore evidence','Synthetic content only',null,null);
 if d?'error' then raise exception 'synthetic draft save failed: %',d->>'error';end if;
 expected:=jsonb_build_object('recipients',d->'recipients','subject',d->>'subject','body',d->>'body');
 r:=public.ar_mail_claim(actor,delivery,(d->>'id')::uuid,(d->>'revision')::integer,'send',null,'<00000000-0000-4000-8000-000000000013@ar-workspace.ar-c82.workers.dev>',expected);
 if r->>'claimed' is distinct from 'true' then raise exception 'synthetic mail claim failed: %',r->>'error';end if;
 -- This is a local SQL simulation of already-verified SENT, not an email send.
 r:=public.ar_mail_confirm_sent(actor,delivery,'synthetic-restore-gmail-id',now());
 if r->>'state' is distinct from 'sent' or r->>'recorded' is distinct from 'true' then raise exception 'synthetic sent confirmation failed: %',r;end if;
end $$;
