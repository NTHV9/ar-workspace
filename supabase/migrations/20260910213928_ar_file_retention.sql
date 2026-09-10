-- DRAFT: owner-approved one-calendar-month byte retention. No provider deletion in SQL.
create table ar_private.retention_items(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),store text not null check(store in('supabase','drive')),object_id text not null,
 target jsonb not null,storage_key text not null,reference_fingerprint text not null,links jsonb not null,minimum_eligible_at timestamptz not null,
 state text not null default 'waiting' check(state in('waiting','blocked','claimed','uncertain','deleted')),reason text,
 eligible_since timestamptz,due_at timestamptz,revision integer not null default 1 check(revision>0),
 claim_id uuid,claim_phase text check(claim_phase in('inspect','armed','reconcile')),lease_until timestamptz,
 enrolled_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz,
 unique(store,object_id),check((eligible_since is null)=(due_at is null)),check((state='deleted')=(deleted_at is not null))
);
create table ar_private.retention_events(
 id bigint generated always as identity primary key,item_id uuid not null references ar_private.retention_items(id),revision integer not null,
 action text not null,reason text,claim_id uuid,recorded_at timestamptz not null default clock_timestamp(),unique(item_id,revision)
);
create index retention_items_due on ar_private.retention_items(state,due_at);
alter table ar_private.retention_items enable row level security;
alter table ar_private.retention_events enable row level security;
revoke all on ar_private.retention_items,ar_private.retention_events from public,anon,authenticated,service_role;

create function ar_private.retention_month(p_time timestamptz) returns timestamptz language sql immutable set search_path='' as $$
 select ((p_time at time zone 'Asia/Bangkok')+interval '1 month') at time zone 'Asia/Bangkok';
$$;
create function ar_private.retention_storage_key(p_key text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_key~('^remittances/'||u||'/'||u||'$') or p_key~('^jobs/'||u||'/(originals|exports)/'||u||'\.pdf$') or p_key~('^jobs/'||u||'/projects/'||u||'\.json$') or p_key~('^jobs/'||u||'/email/'||u||'/'||u||'$'),false)
 from(values('[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}'))x(u);
$$;
create function ar_private.retention_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='retention_events' or tg_op='DELETE' then raise exception 'retention_audit_immutable';end if;
 if row(new.id,new.owner,new.store,new.object_id,new.target,new.storage_key,new.enrolled_at) is distinct from row(old.id,old.owner,old.store,old.object_id,old.target,old.storage_key,old.enrolled_at) or old.state='deleted' then raise exception 'retention_identity_immutable';end if;
 return new;
end $$;
create trigger retention_item_immutable before update or delete on ar_private.retention_items for each row execute function ar_private.retention_immutable();
create trigger retention_event_immutable before update or delete on ar_private.retention_events for each row execute function ar_private.retention_immutable();

-- A receipt, never a filename prefix alone, establishes application ownership.
create view ar_private.retention_storage_receipts as
 select f.storage_key,j.owner,j.hotel,j.account_id,j.invoice_ids,f.byte_count,f.sha256,f.created_at as recorded_at,(f.state='ready') as ready,'document_original'::text as kind,f.id as reference_id
 from public.ar_document_files f join public.ar_document_jobs j on j.id=f.job_id where f.storage_key is not null
 union all
 select f.storage_key,j.owner,j.hotel,j.account_id,j.invoice_ids,f.byte_count,f.sha256,f.created_at,true,'document_upload',j.id
 from ar_private.document_uploads f join public.ar_document_jobs j on j.id=f.job_id
 union all
 select f.storage_key,d.owner,d.hotel,d.account_id,d.invoice_ids,f.byte_count,f.sha256,f.created_at,true,'email_attachment',d.id
 from public.ar_email_attachments f join public.ar_email_drafts d on d.id=f.draft_id
 union all
 select f.storage_key,r.owner,r.hotel,r.account_id,array(select l.invoice_id from public.ar_remittance_lines l where l.record_id=r.id order by l.position),f.byte_count,f.sha256,f.created_at,(f.ready_at is not null),'remittance_file',r.id
 from ar_private.remittance_files f join public.ar_remittances r on r.id=f.record_id;

-- Include current and historical shared references, even if they came from another job.
create view ar_private.retention_storage_references as
 select storage_key,owner,hotel,account_id,invoice_ids,kind,reference_id from ar_private.retention_storage_receipts
 union
 select x.key,j.owner,j.hotel,j.account_id,j.invoice_ids,'document_job',j.id from public.ar_document_jobs j
 cross join lateral(select j.project_key as key union select e->>'storage_key' from jsonb_array_elements(j.exports)e)x where x.key is not null
 union
 select x.key,j.owner,j.hotel,j.account_id,j.invoice_ids,'document_revision',j.id from ar_private.document_revisions v join public.ar_document_jobs j on j.id=v.job_id
 cross join lateral(select v.project_key as key union select e->>'storage_key' from jsonb_array_elements(v.exports)e)x where x.key is not null
 union
 select e->>'storage_key',d.owner,d.hotel,d.account_id,d.invoice_ids,'email_draft',d.id from public.ar_email_drafts d cross join lateral jsonb_array_elements(d.exports)e where e->>'storage_key' is not null
 union
 select e->>'storage_key',m.owner,m.snapshot->'draft'->>'hotel',m.snapshot->'draft'->>'account_id',
  array(select jsonb_array_elements_text(case when jsonb_typeof(m.snapshot->'draft'->'invoice_ids')='array' then m.snapshot->'draft'->'invoice_ids' else '[]'::jsonb end)),'mail_delivery',m.id
 from ar_private.mail_deliveries m cross join lateral jsonb_array_elements(
  (case when jsonb_typeof(m.snapshot->'draft'->'exports')='array' then m.snapshot->'draft'->'exports' else '[]'::jsonb end)||
  (case when jsonb_typeof(m.snapshot->'draft'->'attachments')='array' then m.snapshot->'draft'->'attachments' else '[]'::jsonb end))e
 where m.mode<>'test' and e->>'storage_key' is not null;
revoke all on ar_private.retention_storage_receipts,ar_private.retention_storage_references from public,anon,authenticated,service_role;

create function ar_private.retention_context(p_actor uuid,p_store text,p_object_id text) returns jsonb language plpgsql stable set search_path='' as $$
declare obj storage.objects;df ar_private.drive_archive_files;da ar_private.drive_archives;job public.ar_document_jobs;key text;bytes bigint;sha text;created timestamptz;target jsonb;refs jsonb;links jsonb;
begin
 if p_store='supabase' then
  if p_object_id is null or p_object_id!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('error','retention_invalid');end if;
  select * into obj from storage.objects where id=p_object_id::uuid and bucket_id='ar-working-files';
  if not found then return jsonb_build_object('error','retention_missing');end if;key:=obj.name;created:=obj.created_at;
 elsif p_store='drive' then
  if p_object_id is null or p_object_id!~'^[A-Za-z0-9_-]{10,200}$' then return jsonb_build_object('error','retention_invalid');end if;
  select * into df from ar_private.drive_archive_files where drive_file_id=p_object_id;
  if not found or df.state<>'verified' then return jsonb_build_object('error','retention_unknown_source');end if;
  select * into da from ar_private.drive_archives where id=df.archive_id and kind='job' and owner=p_actor;
  if not found then return jsonb_build_object('error','retention_forbidden');end if;
  select * into job from public.ar_document_jobs where id=da.document_job_id and owner=p_actor;
  if not found then return jsonb_build_object('error','retention_unknown_source');end if;
  key:=df.storage_key;created:=greatest(da.created_at,df.updated_at);
 else return jsonb_build_object('error','retention_invalid');end if;
 if not ar_private.retention_storage_key(key) or not exists(select 1 from ar_private.retention_storage_receipts where storage_key=key) then return jsonb_build_object('error','retention_unknown_source');end if;
 if exists(select 1 from ar_private.retention_storage_receipts where storage_key=key and (owner<>p_actor or not ready or sha256 is null or byte_count is null)) then return jsonb_build_object('error','retention_unknown_source');end if;
 if (select count(distinct sha256) from ar_private.retention_storage_receipts where storage_key=key)<>1 or (select count(distinct byte_count) from ar_private.retention_storage_receipts where storage_key=key)<>1 then return jsonb_build_object('error','retention_identity_mismatch');end if;
 select min(byte_count),min(sha256),greatest(created,max(recorded_at)) into bytes,sha,created from ar_private.retention_storage_receipts where storage_key=key;
 if bytes not between 1 and 104857600 or sha!~'^[0-9a-f]{64}$' then return jsonb_build_object('error','retention_unknown_source');end if;
 if p_store='supabase' then
  if coalesce(obj.metadata->>'size','')!~'^[0-9]{1,16}$' then return jsonb_build_object('error','retention_identity_mismatch');end if;
  if (obj.metadata->>'size')::numeric<>bytes then return jsonb_build_object('error','retention_identity_mismatch');end if;
  target:=jsonb_build_object('store','supabase','objectId',obj.id,'owner',p_actor,'bucket','ar-working-files','key',key,'updatedAt',obj.updated_at,'etag',obj.metadata->>'eTag','byteCount',bytes,'sha256',sha);
 else
  if df.byte_count<>bytes or df.sha256<>sha then return jsonb_build_object('error','retention_identity_mismatch');end if;
  target:=jsonb_build_object('store','drive','objectId',df.drive_file_id,'owner',p_actor,'parentId',da.folder_id,'archiveId',da.id,'jobId',da.document_job_id,'documentRevision',da.document_revision,'ordinal',df.ordinal,'byteCount',bytes,'sha256',sha);
 end if;
 if exists(select 1 from ar_private.retention_storage_references where storage_key=key and (owner<>p_actor or hotel not in('KAT','TSK') or hotel is null or account_id is null or cardinality(invoice_ids)=0 or array_position(invoice_ids,null) is not null)) then return jsonb_build_object('error','retention_unknown_source');end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.kind,r.reference_id,r.hotel,r.account_id),'[]') into refs from(select distinct owner,hotel,account_id,invoice_ids,kind,reference_id from ar_private.retention_storage_references where storage_key=key)r;
 select coalesce(jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'invoiceId',invoice_id) order by hotel,account_id,invoice_id),'[]') into links
 from(select distinct r.hotel,r.account_id,x.invoice_id from ar_private.retention_storage_references r cross join lateral unnest(r.invoice_ids)x(invoice_id) where r.storage_key=key)x;
 if jsonb_array_length(links)=0 then return jsonb_build_object('error','retention_no_links');end if;
 return jsonb_build_object('target',target,'storageKey',key,'referenceFingerprint',md5(refs::text),'links',links,'minimumEligibleAt',created);
end $$;

create function ar_private.retention_eligibility(p_actor uuid,p_links jsonb,p_age integer) returns jsonb language plpgsql stable set search_path='' as $$
declare l jsonb;i public.ar_invoices;e public.ar_invoice_exceptions;z ar_private.invoice_verified_balances;floor timestamptz;stale boolean:=false;
begin
 if p_age is null or p_age not between 60 and 7200 or jsonb_typeof(p_links) is distinct from 'array' then return jsonb_build_object('error','retention_invalid');end if;
 if jsonb_array_length(p_links)=0 then return jsonb_build_object('error','retention_no_links');end if;
 for l in select value from jsonb_array_elements(p_links) loop
  select * into i from public.ar_invoices where hotel=l->>'hotel' and account_id=l->>'accountId' and id=l->>'invoiceId';
  if not found or not ar_private.remittance_verified(i.verification_state,i.collection_role,i.open) or i.synced_at is null then return jsonb_build_object('error','retention_source_unknown');end if;
  if i.open<>0 then return jsonb_build_object('error','retention_source_open');end if;
  if i.synced_at>clock_timestamp() then return jsonb_build_object('error','retention_source_unknown');end if;
  if i.synced_at<clock_timestamp()-make_interval(secs=>p_age) then stale:=true;end if;
  select * into z from ar_private.invoice_verified_balances where hotel=i.hotel and account_id=i.account_id and invoice_id=i.id;
  if not found or z.last_open<>0 or z.zero_since is null or z.zero_since>clock_timestamp() then return jsonb_build_object('error','retention_source_unknown');end if;floor:=greatest(floor,z.zero_since);
  select * into e from public.ar_invoice_exceptions where hotel=i.hotel and account_id=i.account_id and invoice_id=i.id;
  if found and (e.held or e.needs_review or length(btrim(e.dispute))>0) then return jsonb_build_object('error','retention_held');end if;
  if exists(select 1 from public.ar_document_jobs j where j.owner=p_actor and j.hotel=i.hotel and j.account_id=i.account_id and i.id=any(j.invoice_ids) and (j.state<>'ready' or not j.acknowledged)) then return jsonb_build_object('error','retention_pending_documents');end if;
  if exists(select 1 from public.ar_email_drafts d where d.owner=p_actor and d.hotel=i.hotel and d.account_id=i.account_id and i.id=any(d.invoice_ids) and not exists(select 1 from ar_private.mail_deliveries m where m.owner=p_actor and m.draft_id=d.id and m.revision=d.revision and m.state='sent' and m.mode in('send','draft'))) then return jsonb_build_object('error','retention_pending_mail');end if;
  if exists(select 1 from ar_private.mail_deliveries m where m.owner=p_actor and m.mode<>'test' and m.state<>'sent' and m.snapshot->'draft'->>'hotel'=i.hotel and m.snapshot->'draft'->>'account_id'=i.account_id and (m.snapshot->'draft'->'invoice_ids')?i.id) then return jsonb_build_object('error','retention_pending_mail');end if;
  if exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts d on d.id=g.draft_id where d.owner=p_actor and d.hotel=i.hotel and d.account_id=i.account_id and i.id=any(d.invoice_ids) and g.state in('creating','created','uncertain') and not exists(select 1 from ar_private.mail_deliveries m where m.draft_id=d.id and m.revision=g.revision and m.state='sent')) then return jsonb_build_object('error','retention_pending_mail');end if;
  -- A completed new edit/send between scans must restart the month, even if it no
  -- longer looks pending when the next scan runs. These are recorded activity times.
  select greatest(floor,max(j.updated_at)) into floor from public.ar_document_jobs j where j.owner=p_actor and j.hotel=i.hotel and j.account_id=i.account_id and i.id=any(j.invoice_ids);
  select greatest(floor,max(greatest(d.updated_at,m.created_at,m.sent_at))) into floor from public.ar_email_drafts d left join ar_private.mail_deliveries m on m.draft_id=d.id and m.revision=d.revision and m.state='sent' where d.owner=p_actor and d.hotel=i.hotel and d.account_id=i.account_id and i.id=any(d.invoice_ids);
  if e.invoice_id is not null then floor:=greatest(floor,e.updated_at);end if;
 end loop;
 if stale then return jsonb_build_object('error','retention_source_stale','minimumEligibleAt',floor);end if;
 return jsonb_build_object('complete',true,'minimumEligibleAt',floor);
end $$;

create function ar_private.retention_item_json(r ar_private.retention_items) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state,'reason',r.reason,'eligibleSince',r.eligible_since,'dueAt',r.due_at,'claimId',r.claim_id,'target',r.target);
$$;
create function ar_private.retention_event(r ar_private.retention_items,p_action text) returns void language sql set search_path='' as $$
 insert into ar_private.retention_events(item_id,revision,action,reason,claim_id) values(r.id,r.revision,p_action,r.reason,r.claim_id);
$$;

-- Requires exclusive retention transaction lock, then item row lock. No provider call.
create function ar_private.retention_refresh(p_actor uuid,p_id uuid,p_age integer) returns ar_private.retention_items language plpgsql set search_path='' as $$
declare r ar_private.retention_items;ctx jsonb;e jsonb;why text;since timestamptz;due timestamptz;minimum timestamptz;refs text;v_links jsonb;new_state text;
begin
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return null;end if;
 if r.state in('claimed','uncertain','deleted') then return r;end if;
 ctx:=ar_private.retention_context(p_actor,r.store,r.object_id);why:=ctx->>'error';refs:=r.reference_fingerprint;v_links:=r.links;minimum:=r.minimum_eligible_at;
 if why is null and ctx->'target' is distinct from r.target then why:='retention_identity_mismatch';end if;
 if why is null then
  refs:=ctx->>'referenceFingerprint';v_links:=ctx->'links';minimum:=(ctx->>'minimumEligibleAt')::timestamptz;
  e:=ar_private.retention_eligibility(p_actor,v_links,p_age);why:=e->>'error';minimum:=greatest(minimum,(e->>'minimumEligibleAt')::timestamptz);
 end if;
 if why is null and minimum>clock_timestamp() then why:='retention_source_unknown';end if;
 if why='retention_source_stale' and r.eligible_since is not null and r.eligible_since>=minimum and refs=r.reference_fingerprint then since:=r.eligible_since;due:=r.due_at;new_state:='blocked';
 elsif why is not null then since:=null;due:=null;new_state:='blocked';
 else
  since:=r.eligible_since;
  if since is null or since<minimum or refs<>r.reference_fingerprint then since:=clock_timestamp();end if;
  due:=ar_private.retention_month(since);new_state:='waiting';why:=case when due<=clock_timestamp() then 'retention_due' else 'retention_waiting' end;
 end if;
 if row(r.state,r.reason,r.eligible_since,r.due_at,r.reference_fingerprint,r.links,r.minimum_eligible_at) is distinct from row(new_state,why,since,due,refs,v_links,minimum) then
  update ar_private.retention_items set state=new_state,reason=why,eligible_since=since,due_at=due,reference_fingerprint=refs,links=v_links,minimum_eligible_at=minimum,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
  perform ar_private.retention_event(r,case when new_state='blocked' then 'blocked' else 'eligibility_observed' end);
 end if;return r;
end $$;

create function public.ar_retention_enroll(p_actor uuid,p_store text,p_object_id text,p_source_max_age integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;ctx jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_source_max_age is null or p_source_max_age not between 60 and 7200 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where store=p_store and object_id=p_object_id for update;
 if found then
  if r.owner<>p_actor then return jsonb_build_object('error','retention_forbidden');end if;
  r:=ar_private.retention_refresh(p_actor,r.id,p_source_max_age);return ar_private.retention_item_json(r);
 end if;
 ctx:=ar_private.retention_context(p_actor,p_store,p_object_id);if ctx?'error' then return ctx;end if;
 insert into ar_private.retention_items(owner,store,object_id,target,storage_key,reference_fingerprint,links,minimum_eligible_at)
 values(p_actor,p_store,p_object_id,ctx->'target',ctx->>'storageKey',ctx->>'referenceFingerprint',ctx->'links',(ctx->>'minimumEligibleAt')::timestamptz) returning * into r;
 perform ar_private.retention_event(r,'enrolled');r:=ar_private.retention_refresh(p_actor,r.id,p_source_max_age);return ar_private.retention_item_json(r);
end $$;

create function public.ar_retention_candidates(p_actor uuid,p_offset integer,p_limit integer,p_include_deleted boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 or p_include_deleted is null then return jsonb_build_object('error','retention_invalid');end if;
 with candidates as materialized(
  select r.store,r.object_id,r.id as item_id,r.state,r.reason,r.due_at from ar_private.retention_items r where r.owner=p_actor and (p_include_deleted or r.state<>'deleted')
  union all
  select 'supabase',o.id::text,null::uuid,'unenrolled',null::text,null::timestamptz from storage.objects o where o.bucket_id='ar-working-files' and exists(select 1 from ar_private.retention_storage_receipts f where f.storage_key=o.name and f.owner=p_actor) and not exists(select 1 from ar_private.retention_items r where r.store='supabase' and r.object_id=o.id::text)
  union all
  select 'drive',f.drive_file_id,null::uuid,'unenrolled',null::text,null::timestamptz from ar_private.drive_archive_files f join ar_private.drive_archives a on a.id=f.archive_id where a.owner=p_actor and a.kind='job' and f.state='verified' and f.drive_file_id is not null and not exists(select 1 from ar_private.retention_items r where r.store='drive' and r.object_id=f.drive_file_id)
 ), page as(select * from candidates order by store,object_id offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from candidates),'rows',coalesce((select jsonb_agg(jsonb_build_object('store',store,'objectId',object_id,'itemId',item_id,'state',state,'reason',reason,'dueAt',due_at) order by store,object_id) from page),'[]'::jsonb)) into result;return result;
end $$;

create function public.ar_retention_get(p_actor uuid,p_id uuid,p_source_max_age integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_id is null or p_source_max_age is null or p_source_max_age not between 60 and 7200 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);r:=ar_private.retention_refresh(p_actor,p_id,p_source_max_age);
 if r.id is null then return jsonb_build_object('error','retention_missing');end if;return ar_private.retention_item_json(r);
end $$;

create function public.ar_retention_claim(p_actor uuid,p_id uuid,p_claim uuid,p_source_max_age integer,p_max_concurrent integer,p_lease_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;mode text;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_id is null or p_claim is null or p_source_max_age is null or p_source_max_age not between 60 and 7200 or p_max_concurrent is null or p_max_concurrent not between 1 and 8 or p_lease_seconds is null or p_lease_seconds not between 30 and 600 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','retention_missing');end if;
 if r.state='deleted' then return jsonb_build_object('mode','complete','item',ar_private.retention_item_json(r));end if;
 if r.claim_id=p_claim and r.lease_until>clock_timestamp() then return jsonb_build_object('mode',case when r.claim_phase='inspect' and r.state='claimed' then 'delete' else 'reconcile' end,'item',ar_private.retention_item_json(r));end if;
 if r.claim_id is not null and r.lease_until>clock_timestamp() then return jsonb_build_object('mode','busy','item',ar_private.retention_item_json(r));end if;
 if (select count(*) from ar_private.retention_items where state in('claimed','uncertain') and lease_until>clock_timestamp())>=p_max_concurrent then return jsonb_build_object('mode','busy','item',ar_private.retention_item_json(r));end if;
 if r.state in('claimed','uncertain') then mode:='reconcile';
 else
  r:=ar_private.retention_refresh(p_actor,p_id,p_source_max_age);
  if r.state='blocked' and r.reason='retention_missing' then mode:='reconcile';
  elsif r.state<>'waiting' or r.due_at is null or r.due_at>clock_timestamp() then return jsonb_build_object('mode','wait','item',ar_private.retention_item_json(r));
  else mode:='delete';end if;
 end if;
 update ar_private.retention_items set state='claimed',claim_id=p_claim,claim_phase=case when mode='delete' then 'inspect' else 'reconcile' end,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 perform ar_private.retention_event(r,case when mode='delete' then 'claimed' else 'reconciliation_claimed' end);
 return jsonb_build_object('mode',mode,'item',ar_private.retention_item_json(r));
end $$;

create function public.ar_retention_arm(p_actor uuid,p_id uuid,p_claim uuid,p_source_max_age integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;ctx jsonb;e jsonb;why text;minimum timestamptz;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_source_max_age is null or p_source_max_age not between 60 and 7200 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','retention_missing');end if;
 if r.claim_id is distinct from p_claim or p_claim is null then return jsonb_build_object('error','retention_claim_lost');end if;
 if r.state<>'claimed' or r.claim_phase<>'inspect' or r.lease_until<=clock_timestamp() then return jsonb_build_object('proceed',false,'item',ar_private.retention_item_json(r));end if;
 ctx:=ar_private.retention_context(p_actor,r.store,r.object_id);why:=ctx->>'error';
 if why is null and ctx->'target' is distinct from r.target then why:='retention_identity_mismatch';end if;
 if why is null and ctx->>'referenceFingerprint'<>r.reference_fingerprint then why:='retention_references_changed';end if;
 if why is null then e:=ar_private.retention_eligibility(p_actor,ctx->'links',p_source_max_age);why:=e->>'error';minimum:=greatest((ctx->>'minimumEligibleAt')::timestamptz,(e->>'minimumEligibleAt')::timestamptz);end if;
 if why is null and (r.eligible_since is null or r.eligible_since<minimum or r.due_at>clock_timestamp()) then why:='retention_waiting';end if;
 if why is not null then
  update ar_private.retention_items set state='blocked',reason=why,
   eligible_since=case when why='retention_source_stale' and r.eligible_since>=minimum then eligible_since else null end,
   due_at=case when why='retention_source_stale' and r.eligible_since>=minimum then due_at else null end,
   claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
  perform ar_private.retention_event(r,'dispatch_blocked');return jsonb_build_object('proceed',false,'item',ar_private.retention_item_json(r));
 end if;
 update ar_private.retention_items set claim_phase='armed',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 perform ar_private.retention_event(r,'dispatch_armed');return jsonb_build_object('proceed',true,'item',ar_private.retention_item_json(r));
end $$;

create function public.ar_retention_observe(p_actor uuid,p_id uuid,p_claim uuid,p_outcome text,p_source_max_age integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_outcome is null or p_outcome not in('absent','present','unknown','identity_mismatch') or p_source_max_age is null or p_source_max_age not between 60 and 7200 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','retention_missing');end if;
 if r.state='deleted' then return ar_private.retention_item_json(r);end if;
 if p_claim is null or r.claim_id is distinct from p_claim or r.state not in('claimed','uncertain') then return jsonb_build_object('error','retention_claim_lost');end if;
 -- A provider adapter cannot declare Storage absent while its exact metadata row
 -- still exists. Access-denied/misleading 404 responses must never erase this proof.
 if p_outcome='absent' and r.store='supabase' and exists(select 1 from storage.objects where id=r.object_id::uuid) then p_outcome:='unknown';end if;
 if p_outcome='absent' then
  -- This stores provider-verified absence only. It never deletes business metadata.
  update ar_private.retention_items set state='deleted',reason='retention_observed_absent',deleted_at=clock_timestamp(),claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 elsif p_outcome='unknown' then
  update ar_private.retention_items set state='uncertain',reason='retention_outcome_unknown',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 elsif p_outcome='identity_mismatch' then
  update ar_private.retention_items set state='blocked',reason='retention_identity_mismatch',eligible_since=null,due_at=null,claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 else
  if r.claim_phase<>'reconcile' and r.state<>'uncertain' then return jsonb_build_object('error','retention_invalid');end if;
  update ar_private.retention_items set state='waiting',reason='retention_observed_present',claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 end if;
 perform ar_private.retention_event(r,'provider_'||p_outcome);
 if p_outcome='present' then r:=ar_private.retention_refresh(p_actor,p_id,p_source_max_age);end if;
 return ar_private.retention_item_json(r);
end $$;

-- Root must call this INSIDE each write transaction before new file references,
-- restore links, document saves/uploads or mail claims. Shared lock fences enrollment/
-- claim/arm through commit. A separate preflight RPC would not provide this fence.
create function ar_private.retention_write_allowed(p_actor uuid,p_hotel text,p_account text,p_invoice_ids text[],p_storage_keys text[] default '{}') returns boolean language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if p_actor is null or p_invoice_ids is null or p_storage_keys is null or cardinality(p_invoice_ids)+cardinality(p_storage_keys)=0 then return false;end if;
 return not exists(select 1 from ar_private.retention_items r where r.owner=p_actor and r.state in('claimed','uncertain') and
  (r.storage_key=any(p_storage_keys) or exists(select 1 from jsonb_array_elements(r.links)l where l->>'hotel'=p_hotel and l->>'accountId'=p_account and l->>'invoiceId'=any(p_invoice_ids))));
end $$;

-- Optional root publication hook: only claims that have never armed a deletion can
-- be cancelled. Armed/unknown outcomes must be reconciled, even after reopening.
create function ar_private.retention_cancel_unarmed(p_hotel text,p_account text,p_invoice_ids text[]) returns integer language plpgsql set search_path='' as $$
declare r ar_private.retention_items;n integer:=0;
begin
 perform pg_advisory_xact_lock(61704,1439);
 for r in select * from ar_private.retention_items x where x.state in('claimed','uncertain') and x.claim_phase='inspect' and exists(select 1 from jsonb_array_elements(x.links)l where l->>'hotel'=p_hotel and l->>'accountId'=p_account and l->>'invoiceId'=any(p_invoice_ids)) for update loop
  update ar_private.retention_items set state='blocked',reason='retention_source_unknown',eligible_since=null,due_at=null,claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  perform ar_private.retention_event(r,'unarmed_claim_cancelled');n:=n+1;
 end loop;return n;
end $$;

revoke all on function ar_private.retention_month(timestamptz),ar_private.retention_storage_key(text),ar_private.retention_immutable(),ar_private.retention_context(uuid,text,text),ar_private.retention_eligibility(uuid,jsonb,integer),ar_private.retention_item_json(ar_private.retention_items),ar_private.retention_event(ar_private.retention_items,text),ar_private.retention_refresh(uuid,uuid,integer),ar_private.retention_write_allowed(uuid,text,text,text[],text[]),ar_private.retention_cancel_unarmed(text,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.ar_retention_enroll(uuid,text,text,integer),public.ar_retention_candidates(uuid,integer,integer,boolean),public.ar_retention_get(uuid,uuid,integer),public.ar_retention_claim(uuid,uuid,uuid,integer,integer,integer),public.ar_retention_arm(uuid,uuid,uuid,integer),public.ar_retention_observe(uuid,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_retention_enroll(uuid,text,text,integer),public.ar_retention_candidates(uuid,integer,integer,boolean),public.ar_retention_get(uuid,uuid,integer),public.ar_retention_claim(uuid,uuid,uuid,integer,integer,integer),public.ar_retention_arm(uuid,uuid,uuid,integer),public.ar_retention_observe(uuid,uuid,uuid,text,integer) to service_role;
