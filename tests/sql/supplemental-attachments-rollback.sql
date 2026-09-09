begin;
do $$
declare j public.ar_document_jobs;d jsonb;r jsonb;fid uuid:=gen_random_uuid();gid uuid:=gen_random_uuid();key text;revision integer;delivery jsonb;
begin
 select * into j from public.ar_document_jobs where acknowledged and state='ready' and jsonb_array_length(exports)>0 and id not in(select document_job_id from public.ar_email_drafts) limit 1;
 if j.id is null then raise exception 'Separate reviewed job required';end if;
 d:=public.ar_email_open(j.owner,j.id,j.revision);revision:=(d->>'revision')::int;key:='jobs/'||j.id||'/email/'||(d->>'id')||'/'||fid;
 r:=public.ar_email_attachment_add_v2(j.owner,(d->>'id')::uuid,revision,fid,'synthetic.pdf',key,'application/pdf',1000,repeat('a',64),'{"version":1,"pages":1}',10485760);
 if r?'error' or jsonb_array_length(r->'attachments')<>1 then raise exception 'attachment add failed: %',r->>'error';end if;
 if public.ar_email_attachment_record(gen_random_uuid(),(d->>'id')::uuid,fid) is not null then raise exception 'attachment owner leak';end if;
 r:=public.ar_email_attachment_add_v2(j.owner,(d->>'id')::uuid,revision,fid,'synthetic.pdf',key,'application/pdf',1000,repeat('a',64),'{"version":1}',10485760);
 if (r->>'revision')::int<>revision+1 then raise exception 'duplicate upload changed revision';end if;
 r:=public.ar_email_attachment_add_v2(j.owner,(d->>'id')::uuid,revision+1,gid,'budget.pdf','jobs/'||j.id||'/email/'||(d->>'id')||'/'||gid,'application/pdf',10485760,repeat('b',64),'{"version":1}',10485760);
 if r->>'error'<>'email_too_large' then raise exception 'combined budget not enforced';end if;
 r:=public.ar_email_attachment_remove(j.owner,(d->>'id')::uuid,revision,fid);if r->>'error'<>'email_revision_conflict' then raise exception 'stale remove accepted';end if;
 d:=public.ar_email_get(j.owner,(d->>'id')::uuid);
 delivery:=public.ar_mail_claim(j.owner,gen_random_uuid(),(d->>'id')::uuid,(d->>'revision')::int,'draft',null,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('recipients',d->'recipients','subject',d->>'subject','body',d->>'body'));
 if not (delivery->>'claimed')::boolean then raise exception 'handoff fixture failed';end if;
 r:=public.ar_email_attachment_remove(j.owner,(d->>'id')::uuid,(d->>'revision')::int,fid);if r->>'error'<>'email_handoff_pending' then raise exception 'handed-off file changed';end if;
 -- Complete the synthetic claim only inside this rollback transaction.
 update ar_private.mail_deliveries set state='sent' where id=(delivery->>'id')::uuid;
 r:=public.ar_email_attachment_remove(j.owner,(d->>'id')::uuid,(d->>'revision')::int,fid);
 if r?'error' or jsonb_array_length(r->'attachments')<>0 then raise exception 'remove failed';end if;
 if not exists(select 1 from public.ar_email_attachments where id=fid and removed) then raise exception 'removal was not soft';end if;
 r:=public.ar_email_attachment_add_v2(j.owner,(d->>'id')::uuid,(r->>'revision')::int,fid,'synthetic.pdf',key,'application/pdf',1000,repeat('a',64),'{"version":1}',10485760);
 if r->>'error'<>'attachment_command_conflict' then raise exception 'tombstone resurrected';end if;
end $$;
rollback;
select 'supplemental attachment rollback checks passed' result;
