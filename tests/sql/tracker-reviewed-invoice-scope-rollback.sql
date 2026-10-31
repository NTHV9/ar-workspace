-- Exact synthetic source coverage. No provider call; every mutation rolls back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-REVIEWED-SCOPE-'||gen_random_uuid();lease uuid:=gen_random_uuid();j jsonb;d jsonb;r jsonb;f record;exports jsonb:='[]';k text;mid uuid:=gen_random_uuid();expected jsonb;rows jsonb;day date:=(now() at time zone 'Asia/Bangkok')::date;q uuid;before_count bigint;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,scope,'Synthetic reviewed scope','SYNTHETIC',100,0,4,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,id,id,'F-'||id,current_date,amount,amount,'verified','standalone',false,now() from (values('a',10),('b',20),('c',30),('d',40)) x(id,amount);
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_reviewed_scope_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 select jsonb_agg(jsonb_build_object('rowKey',scope||id,'hotel','KAT','accountNo',scope,'invoiceNo',id,'folio','F-'||id,'transactionDate',current_date::text,'locator','{}'::jsonb,'fields','{"R":null,"U":null,"V":null,"W":null}'::jsonb)) into rows from public.ar_invoices where hotel='KAT' and account_id=scope;
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['a','b','c','d'],'invoices','separate','billing','native');
 for f in select * from public.ar_document_files where job_id=(j->>'id')::uuid loop
  perform public.ar_document_claim_file((j->>'id')::uuid,f.id);
  perform public.ar_document_finish_file((j->>'id')::uuid,f.id,'jobs/'||(j->>'id')||'/originals/'||f.id||'.pdf',100,repeat('a',64));
  if f.invoice_id='a' then continue;end if;
  k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';
  perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));
  perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
  exports:=exports||jsonb_build_array(jsonb_build_object('name','Renamed-'||f.invoice_id||'.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64),'invoice_ids',jsonb_build_array(f.invoice_id)));
 end loop;
 begin perform public.ar_document_review(actor,(j->>'id')::uuid,0,exports,true);
 exception when others then raise exception 'reviewed source scope rejected: %',sqlerrm;end;
 if (public.ar_document_get((j->>'id')::uuid)->'invoice_ids') is distinct from '["a","b","c","d"]'::jsonb then raise exception 'Original job identity was rewritten';end if;
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);
 if d->'invoice_ids' is distinct from '["b","c","d"]'::jsonb then raise exception 'Draft retained deleted invoice: %',d;end if;
 d:=public.ar_email_save_v3(actor,(d->>'id')::uuid,(d->>'revision')::integer,'billing','{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]}',d->>'subject',d->>'body',null,null,null);
 expected:=jsonb_build_object('recipients',d->'recipients','subject',d->>'subject','body',d->>'body','richBody',d->'rich_body','thread',d->'thread','mailbox','phuket','sender','ar@katathani.com');
 r:=public.ar_mail_claim(actor,mid,(d->>'id')::uuid,(d->>'revision')::integer,'send',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);
 if r->>'claimed' is distinct from 'true' then raise exception 'New source-scoped claim rejected: %',r;end if;
 if jsonb_array_length(r#>'{snapshot,manifest}')<>3 or jsonb_array_length(r#>'{snapshot,workflow}')<>3 or r#>'{snapshot,draft,invoice_ids}' is distinct from '["b","c","d"]'::jsonb then raise exception 'Claim captured original selection instead of reviewed scope';end if;
 r:=public.ar_mail_confirm_sent(actor,mid,'synthetic-reviewed-scope',now());
 if r->>'state' is distinct from 'sent' then raise exception 'Scoped confirmation failed: %',r;end if;
 if not exists(select 1 from public.ar_sent_events where delivery_id=mid and invoice_ids=array['b','c','d'] and open_at_send=90) then raise exception 'Sent invoice count or amount includes deleted invoice';end if;
 if (select count(*) from ar_private.tracker_outbox where delivery_id=mid and field='R')<>3 or exists(select 1 from ar_private.tracker_outbox where delivery_id=mid and invoice_id='a') then raise exception 'Sheet intents include deleted invoice';end if;
 -- An uncertain Sheet write is independent from durable Gmail/Sent evidence.
 select id into strict q from ar_private.tracker_outbox where delivery_id=mid and invoice_id='b' and field='R';
 perform public.ar_tracker_write_result(actor,'phuket',lease,q,'uncertain','null',to_jsonb(day::text),'synthetic-response-lost');
 select count(*) into before_count from ar_private.mail_deliveries where owner=actor;
 perform public.ar_mail_confirm_sent(actor,mid,'synthetic-reviewed-scope',now());
 if (select count(*) from ar_private.mail_deliveries where owner=actor)<>before_count or (select count(*) from public.ar_sent_events where delivery_id=mid)<>1 then raise exception 'Sheet uncertainty duplicated mail/history';end if;
 perform public.ar_tracker_write_result(actor,'phuket',lease,q,'written','null',to_jsonb(day::text),'synthetic-readback');
 -- Staff changes/clears the published date; repeating confirmation cannot restore it.
 rows:=jsonb_set(rows,array[(select (ordinality-1)::text from jsonb_array_elements(rows) with ordinality where value->>'invoiceNo'='b'),'fields','R'],to_jsonb((day-2)::text));
 perform public.ar_tracker_snapshot(actor,'phuket',lease,rows);
 perform public.ar_mail_confirm_sent(actor,mid,'synthetic-reviewed-scope',now());
 if (select actual_date from ar_private.tracker_current_dates where hotel='KAT' and account_id=scope and invoice_id='b' and field='R') is distinct from day-2 then raise exception 'Repeated Sent restored a staff-edited date';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='a' and first_billing_date is not null) then raise exception 'Excluded invoice was marked billed';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'email_records');
 if r#>>'{rows,0,invoice_count}' is distinct from '3' or r#>'{rows,0,invoice_ids}' is distinct from '["b","c","d"]'::jsonb then raise exception 'Email history still displays the original selection: %',r;end if;
end$$;
rollback;
