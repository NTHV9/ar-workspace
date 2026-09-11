-- File retention adapters, cross-command fences, and metadata-only status.
alter table ar_private.retention_items add column delete_ack_at timestamptz;
create function public.ar_retention_delete_ack(p_actor uuid,p_id uuid,p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found or p_claim is null or r.claim_id is distinct from p_claim or r.claim_phase<>'armed' or r.state<>'claimed' then return jsonb_build_object('error','retention_claim_lost');end if;
 update ar_private.retention_items set delete_ack_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 perform ar_private.retention_event(r,'provider_delete_acknowledged');return jsonb_build_object('acknowledged',true);
end$$;
create function public.ar_retention_inspect(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;o storage.objects;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor;if not found then return jsonb_build_object('error','retention_missing');end if;
 if r.store='drive' then return jsonb_build_object('deleteAcknowledged',r.delete_ack_at is not null);end if;
 select * into o from storage.objects where bucket_id='ar-working-files' and (id=r.object_id::uuid or name=r.storage_key) limit 1;
 if not found then return jsonb_build_object('state','absent');end if;
 return jsonb_build_object('state','present','identityVerified',o.id::text=r.object_id and o.name=r.storage_key and o.updated_at=(r.target->>'updatedAt')::timestamptz and o.metadata->>'size'=r.target->>'byteCount' and (o.metadata->>'eTag') is not distinct from (r.target->>'etag'));
end$$;
create function public.ar_retention_status(p_actor uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','retention_invalid');end if;
 with scoped as materialized(select * from ar_private.retention_items where owner=p_actor),page as(select * from scoped order by updated_at desc,id offset p_offset limit 50)
 select jsonb_build_object('total',(select count(*) from scoped),'summary',(select jsonb_build_object('waiting',count(*) filter(where state='waiting'),'blocked',count(*) filter(where state='blocked'),'uncertain',count(*) filter(where state in('claimed','uncertain')),'deleted',count(*) filter(where state='deleted'),'deletedBytes',coalesce(sum((target->>'byteCount')::bigint) filter(where state='deleted'),0)) from scoped),'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'store',store,'state',state,'reason',reason,'eligibleSince',eligible_since,'dueAt',due_at,'deletedAt',deleted_at,'bytes',(target->>'byteCount')::bigint) order by updated_at desc,id) from page),'[]'::jsonb)) into result;return result;
end$$;
-- Every reference-producing transaction holds this shared advisory fence until
-- commit. Provider dispatch arms under the exclusive version of the same lock.
create function ar_private.retention_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;scope jsonb;job_id uuid;draft_id uuid;record_id uuid;archive_id uuid;ids text[];actor_id uuid;
begin
 if tg_table_name in('ar_document_jobs','ar_email_drafts','ar_remittances') then scope:=v;
 elsif tg_table_name in('ar_document_files','document_uploads','document_revisions') then job_id:=(v->>'job_id')::uuid;
 elsif tg_table_name in('ar_email_attachments','gmail_draft_attempts') then draft_id:=(v->>'draft_id')::uuid;
 elsif tg_table_name='mail_deliveries' then if v->>'mode'='test' then return case when tg_op='DELETE' then old else new end;end if;scope:=(v->'snapshot'->'draft')||jsonb_build_object('owner',v->>'owner');
 elsif tg_table_name in('remittance_files','ar_remittance_lines') then record_id:=(v->>'record_id')::uuid;
 elsif tg_table_name='drive_archive_files' then archive_id:=(v->>'archive_id')::uuid;
 elsif tg_table_name='drive_archives' then if v->>'kind'='test' then return case when tg_op='DELETE' then old else new end;end if;job_id:=(v->>'document_job_id')::uuid;
 elsif tg_table_name in('ar_invoices','ar_invoice_exceptions') then
  actor_id:=public.ar_financial_service_actor();ids:=array[coalesce(v->>'invoice_id',v->>'id')];
  if tg_table_name='ar_invoices' then perform ar_private.retention_cancel_unarmed(v->>'hotel',v->>'account_id',ids);end if;
  if not ar_private.retention_write_allowed(actor_id,v->>'hotel',v->>'account_id',ids) then raise exception 'retention_busy';end if;
  return case when tg_op='DELETE' then old else new end;
 end if;
 if archive_id is not null then select document_job_id into job_id from ar_private.drive_archives where id=archive_id and kind='job';end if;
 if job_id is not null then select to_jsonb(j) into scope from public.ar_document_jobs j where id=job_id;end if;
 if draft_id is not null then select to_jsonb(d) into scope from public.ar_email_drafts d where id=draft_id;end if;
 if record_id is not null then select to_jsonb(r) into scope from public.ar_remittances r where id=record_id;end if;
 if scope is null then return case when tg_op='DELETE' then old else new end;end if;
 if tg_table_name in('remittance_files','ar_remittance_lines','ar_remittances') then
  select array_agg(l.invoice_id) into ids from public.ar_remittance_lines l where l.record_id=(scope->>'id')::uuid;
  if tg_table_name='ar_remittance_lines' then ids:=coalesce(ids,'{}')||array[v->>'invoice_id'];end if;
 else select array_agg(value) into ids from jsonb_array_elements_text(coalesce(scope->'invoice_ids','[]'::jsonb));end if;
 if cardinality(ids)>0 and not ar_private.retention_write_allowed((scope->>'owner')::uuid,scope->>'hotel',scope->>'account_id',ids) then raise exception 'retention_busy';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
do $$declare name text;begin
 foreach name in array array['public.ar_document_jobs','public.ar_document_files','ar_private.document_uploads','ar_private.document_revisions','public.ar_email_drafts','public.ar_email_attachments','ar_private.gmail_draft_attempts','ar_private.mail_deliveries','public.ar_remittances','public.ar_remittance_lines','ar_private.remittance_files','ar_private.drive_archives','ar_private.drive_archive_files','public.ar_invoices','public.ar_invoice_exceptions'] loop
  execute format('create trigger retention_reference_guard before insert or update or delete on %s for each row execute function ar_private.retention_reference_guard()',name);
 end loop;
end$$;
-- Return a tombstone instead of treating an intentionally expired object as a
-- network failure or silently regenerating source documents.
create function public.ar_retention_file_state(p_actor uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 return jsonb_build_object('expired',exists(select 1 from ar_private.retention_items where owner=p_actor and storage_key=p_key and store='supabase' and state='deleted'));
end$$;
revoke all on function ar_private.retention_reference_guard() from public,anon,authenticated,service_role;
revoke all on function public.ar_retention_delete_ack(uuid,uuid,uuid),public.ar_retention_inspect(uuid,uuid),public.ar_retention_status(uuid,integer),public.ar_retention_file_state(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_retention_delete_ack(uuid,uuid,uuid),public.ar_retention_inspect(uuid,uuid),public.ar_retention_status(uuid,integer),public.ar_retention_file_state(uuid,text) to service_role;

create function public.ar_retention_drive_expired(p_actor uuid,p_ids text[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_ids is null or cardinality(p_ids)>4000 then return jsonb_build_object('error','retention_invalid');end if;
 return coalesce((select jsonb_agg(object_id) from ar_private.retention_items where owner=p_actor and store='drive' and object_id=any(p_ids) and state='deleted'),'[]'::jsonb);
end$$;
revoke all on function public.ar_retention_drive_expired(uuid,text[]) from public,anon,authenticated,service_role;
grant execute on function public.ar_retention_drive_expired(uuid,text[]) to service_role;
