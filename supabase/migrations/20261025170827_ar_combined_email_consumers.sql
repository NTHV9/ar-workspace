-- Combined messages retain one provider receipt. Every business consumer reads
-- the exact immutable member scope, including when invoice IDs repeat by Hotel.
alter table ar_private.tracker_outbox drop constraint tracker_outbox_delivery_id_fkey;
alter table ar_private.tracker_outbox add foreign key(delivery_id) references ar_private.mail_deliveries(id);
alter table ar_private.tracker_outbox drop constraint tracker_outbox_delivery_id_invoice_id_field_key;
alter table ar_private.tracker_outbox add unique(delivery_id,hotel,account_id,invoice_id,field);

-- Bootstrap remains a current consumer of this queue. Update the exact old
-- conflict target in every installed caller, including private reachable copies.
do $$declare r record;definition text;old_target text:='on[[:space:]]+conflict[[:space:]]*\([[:space:]]*delivery_id[[:space:]]*,[[:space:]]*invoice_id[[:space:]]*,[[:space:]]*field[[:space:]]*\)';changed integer:=0;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','ar_private') and p.prosrc like '%tracker_outbox%' and p.prosrc~*old_target loop
  definition:=pg_get_functiondef(r.oid);
  execute regexp_replace(definition,old_target,'on conflict(delivery_id,hotel,account_id,invoice_id,field)','gi');changed:=changed+1;
 end loop;
 if changed<1 then raise exception 'combined_bootstrap_conflict_definition_drift';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','ar_private') and p.prosrc like '%tracker_outbox%' and p.prosrc~*old_target) then raise exception 'combined_bootstrap_conflict_target_remaining';end if;
end$$;

-- Never-attempted common composers have the same explicit departure lifecycle
-- as their child preparations. Keep only a terminal identity receipt; attempted
-- roots (including Sent, Draft/unknown/error states) retain all frozen evidence.
alter table ar_private.combined_email_preparations add column closed_at timestamptz,add column closed_reason text;
alter table ar_private.combined_email_preparations add constraint combined_preparation_closure check(
 (closed_at is null and closed_reason is null) or (closed_at is not null and closed_reason='discarded'));
create function ar_private.combined_closed_members(p_members jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(m) e(k,v) where k=any(array['memberId','documentJobId','documentRevision','draftId','draftRevision','hotel','accountId','invoiceIds','purpose','stage','policyVersion'])) order by n),'[]') from jsonb_array_elements(p_members) with ordinality x(m,n);
$$;
-- VOLATILE read-only lookup deliberately sees the closing row from its AFTER
-- trigger. Every member must still resolve to the same owned, closed artifact.
create function ar_private.combined_preparation_discardable(p_id uuid,p_owner uuid) returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from ar_private.combined_email_preparations p where p.id=p_id and p.owner=p_owner
 and jsonb_array_length(p.members)>0 and not exists(select 1 from ar_private.mail_deliveries m where m.combined_preparation_id=p.id)
 and not exists(select 1 from jsonb_array_elements(p.members) b where not exists(
  select 1 from public.ar_document_jobs j join public.ar_email_drafts d on d.id=(b->>'draftId')::uuid and d.document_job_id=j.id and d.owner=p.owner
  where j.id=(b->>'documentJobId')::uuid and j.owner=p.owner and j.lifecycle='transient' and j.closed_at is not null and j.closed_reason in('sent','discarded'))));
$$;
create function ar_private.combined_discard_closed(p_actor uuid,p_id uuid default null,p_limit integer default 10) returns integer language plpgsql set search_path='' as $$
declare p ar_private.combined_email_preparations;n integer:=0;begin
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 -- Never wait while a job-row trigger is running: the admitted save/send owns
 -- actor 735 before its rows. Scheduled maintenance retries skipped roots.
 if not pg_try_advisory_xact_lock_shared(61704,1439) then return 0;end if;
 if not pg_try_advisory_xact_lock(hashtextextended(p_actor::text,735)) then return 0;end if;
 for p in select c.* from ar_private.combined_email_preparations c where c.owner=p_actor and c.closed_at is null and (p_id is null or c.id=p_id)
  and ar_private.combined_preparation_discardable(c.id,c.owner) order by c.updated_at,c.id limit p_limit for update of c skip locked loop
  -- Recheck under the exact root lock. No provider attempt can race this actor.
  if not ar_private.combined_preparation_discardable(p.id,p.owner) then continue;end if;
  update ar_private.combined_email_preparations set content='{}',members=ar_private.combined_closed_members(p.members),closed_at=clock_timestamp(),closed_reason='discarded',updated_at=clock_timestamp() where id=p.id and owner=p_actor;
  update ar_private.combined_email_commands set result='{"error":"document_closed"}' where preparation_id=p.id;
  n:=n+1;
 end loop;return n;
end$$;
create function ar_private.combined_close_child() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform ar_private.combined_discard_closed(new.owner,null,25);return new;
end$$;
create trigger combined_close_child after update of closed_at on public.ar_document_jobs for each row when(old.closed_at is null and new.closed_at is not null) execute function ar_private.combined_close_child();
revoke all on function ar_private.combined_closed_members(jsonb),ar_private.combined_preparation_discardable(uuid,uuid),ar_private.combined_discard_closed(uuid,uuid,integer),ar_private.combined_close_child() from public,anon,authenticated,service_role;

-- Guard GET and all idempotent/revision paths even when cleanup was deferred by
-- a concurrent save. No cached result can expose or resurrect a departed body.
do $$declare definition text;needle text;oid regprocedure;begin
 foreach oid in array array['public.ar_combined_email_get(uuid,uuid)'::regprocedure,'public.ar_combined_mail_claim(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);needle:=' if not ar_private.gmail_region_access(p_actor,p.mailbox) then';
  if strpos(definition,needle)=0 then raise exception 'combined_closed_read_definition_drift';end if;
  definition:=replace(definition,needle,$q$ if p.closed_at is not null or ar_private.combined_preparation_discardable(p.id,p_actor) then return jsonb_build_object('error','document_closed');end if;
$q$||needle);execute definition;
 end loop;
 definition:=pg_get_functiondef('public.ar_combined_email_save(uuid,uuid,integer,uuid,jsonb,jsonb)'::regprocedure);
 needle:=' digest:=encode';if strpos(definition,needle)=0 then raise exception 'combined_closed_save_definition_drift';end if;
 definition:=replace(definition,needle,$q$ perform ar_private.combined_discard_closed(p_actor,p_id,1);
 if exists(select 1 from ar_private.combined_email_preparations c where c.id=p_id and c.owner=p_actor and c.closed_at is not null) or ar_private.combined_preparation_discardable(p_id,p_actor) then return jsonb_build_object('error','document_closed');end if;
$q$||needle);
 needle:=' if found then if not ar_private.gmail_region_access(p_actor,c.result->>''mailbox'') then';
 if strpos(definition,needle)=0 then raise exception 'combined_closed_command_definition_drift';end if;
 definition:=replace(definition,needle,$q$ if found then if exists(select 1 from ar_private.combined_email_preparations cp where cp.id=c.preparation_id and cp.owner=p_actor and cp.closed_at is not null) or ar_private.combined_preparation_discardable(c.preparation_id,p_actor) then return jsonb_build_object('error','document_closed');end if;if not ar_private.gmail_region_access(p_actor,c.result->>'mailbox') then$q$);execute definition;
 -- Reuse existing exact-owner maintenance. This is an all-closed retry, never
 -- an age-based purge, and does not change file/month/business retention policy.
 foreach oid in array array['public.ar_document_finalize_abandoned(uuid,integer)'::regprocedure,'public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure,'public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);needle:=' if p_limit is null or p_limit not between 1 and 25 then raise exception ''document_request_invalid'';end if;';
  if strpos(definition,needle)=0 then raise exception 'combined_closed_retry_definition_drift';end if;
  definition:=replace(definition,needle,needle||E'\n perform ar_private.combined_discard_closed(p_actor,null,p_limit);');execute definition;
 end loop;
end$$;

create function ar_private.tracker_confirmed_scope_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from ar_private.sent_scope_facts e where e.delivery_id=new.delivery_id and e.owner=new.owner
  and e.hotel=new.hotel and e.account_id=new.account_id and new.invoice_id=any(e.invoice_ids)
  and new.field=case when e.purpose='billing' then 'R' when e.purpose='collection' then case e.stage when 'Follow 1' then 'U' when 'Follow 2' then 'V' when 'Follow 3' then 'W' end end)
 then raise exception 'tracker_confirmed_scope_missing';end if;
 return new;
end$$;
create trigger tracker_confirmed_scope before insert or update of delivery_id,owner,hotel,account_id,invoice_id,field on ar_private.tracker_outbox for each row execute function ar_private.tracker_confirmed_scope_guard();
revoke all on function ar_private.tracker_confirmed_scope_guard() from public,anon,authenticated,service_role;
-- Reuse the installed captured-intent/authority-generation/suppression algorithm.
-- Combined claims precede Gmail: a Sheet edit while Gmail is in flight must
-- suppress this stale publication without suppressing newer sibling intents.
do $$declare definition text:=pg_get_functiondef('ar_private.tracker_sent_enqueue()'::regprocedure);needle text;begin
 definition:=replace(definition,'FUNCTION ar_private.tracker_sent_enqueue()','FUNCTION ar_private.combined_tracker_sent_enqueue()');
 definition:=replace(definition,'declare f text;i text;c ar_private.tracker_current_dates;d date;','declare f text;i text;c ar_private.tracker_current_dates;d date;frozen jsonb;b ar_private.combined_delivery_members;');
 needle:='  d:=case when f=''R'' then';
 if strpos(definition,needle)=0 then raise exception 'combined_enqueue_definition_drift';end if;
 definition:=replace(definition,needle,$q$  select * into strict b from ar_private.combined_delivery_members where delivery_id=new.delivery_id and member_id=new.member_id;
  select x into frozen from jsonb_array_elements(coalesce(b.member_snapshot->'trackerAuthority','[]')) x where x->>'invoiceId'=i and x->>'field'=f;
  if frozen is null or (frozen->>'generation')::bigint is distinct from coalesce(c.generation,0) or (frozen->>'exists')::boolean is distinct from (c.field is not null)
   or coalesce((frozen->>'rowPresent')::boolean,false) and not exists(select 1 from ar_private.tracker_rows r where r.hotel=new.hotel and r.account_id=new.account_id and r.invoice_id=i and r.present) then
   d:=(new.sent_at at time zone 'Asia/Bangkok')::date;
   insert into ar_private.tracker_outbox(delivery_id,owner,hotel,account_id,invoice_id,field,desired_value,authority_generation,intent_captured,state,created_at)
   values(new.delivery_id,new.owner,new.hotel,new.account_id,i,f,to_jsonb(d),coalesce((frozen->>'generation')::bigint,0),true,'suppressed',clock_timestamp()) on conflict do nothing;
   continue;
  end if;
  d:=case when f='R' then$q$);
 execute definition;
end$$;
revoke all on function ar_private.combined_tracker_sent_enqueue() from public,anon,authenticated,service_role;
create trigger combined_tracker_sent_outbox after insert on ar_private.combined_sent_scopes for each row execute function ar_private.combined_tracker_sent_enqueue();
create trigger combined_tracker_data_changed after insert on ar_private.combined_sent_scopes for each row execute function ar_private.tracker_data_changed();
create trigger combined_sent_invalidate_period after insert on ar_private.combined_sent_scopes for each statement execute function ar_private.invalidate_period_summaries();

-- Patch a deliberately enumerated set of CURRENT definitions. Do not reinstate
-- retired report capture or old regional enablement gates from historic files.
do $$declare r record;definition text;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  n.nspname='ar_private' and p.proname in('tracker_billing_floor','tracker_confirmed_reminder_reversion','tracker_append_source')
  or n.nspname='public' and p.proname in('ar_tracker_outbox','ar_tracker_snapshot','ar_tracker_confirm_preview','ar_tracker_status') loop
  definition:=pg_get_functiondef(r.oid);
  definition:=regexp_replace(definition,'\m(public\.)?ar_sent_events\M','ar_private.sent_scope_facts','g');
  -- The outbox projection must not multiply a repeated invoice ID by root.
  definition:=replace(definition,'ev.delivery_id=q.delivery_id','ev.delivery_id=q.delivery_id and ev.owner=q.owner and ev.hotel=q.hotel and ev.account_id=q.account_id and q.invoice_id=any(ev.invoice_ids)');
  if r.oid='ar_private.tracker_append_source(uuid,text,uuid,boolean)'::regprocedure then
   -- An adopted Sheet field is authoritative even when its actual_date is NULL.
   -- Overlay it on Gmail evidence before hashing or publishing a missing row.
   definition:=replace(definition,' select coalesce(array_agg(ad.queue_id', $q$ select dates||coalesce(jsonb_object_agg(c.field,to_jsonb(c.actual_date)),'{}'::jsonb) into dates
 from ar_private.tracker_current_dates c where c.hotel=i.hotel and c.account_id=i.account_id and c.invoice_id=i.id;
 select coalesce(array_agg(ad.queue_id$q$);
  end if;
  execute definition;
 end loop;
 for r in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ar_private' and c.relname in('tracker_effective_collection_stage','tracker_append_admissions') loop
  definition:=pg_get_viewdef(r.oid,true);
  definition:=regexp_replace(definition,'\m(public\.)?ar_sent_events\M','ar_private.sent_scope_facts','g');
  definition:=replace(definition,$q$m.snapshot -> 'workflow'::text$q$,$q$e.workflow$q$);
  execute format('create or replace view %I.%I as %s',r.nspname,r.relname,definition);
 end loop;
 -- Exact receipt identity now includes Hotel and Account, not just root/id.
 definition:=pg_get_functiondef('ar_private.tracker_publish_receipt()'::regprocedure);
 definition:=replace(definition,'delivery_id=new.delivery_id and invoice_id=new.invoice_id and field=new.field','delivery_id=new.delivery_id and hotel=new.hotel and account_id=new.account_id and invoice_id=new.invoice_id and field=new.field');execute definition;
end$$;

create or replace function ar_private.tracker_confirm_billing_floor() returns trigger language plpgsql security definer set search_path='' as $$
declare event record;invoice text;w public.ar_invoice_workflow;floor_day date;begin
 for event in select * from ar_private.sent_scope_facts where delivery_id=new.id and owner=new.owner and purpose='billing' loop
  foreach invoice in array event.invoice_ids loop
   floor_day:=ar_private.tracker_billing_floor(event.hotel,event.account_id,invoice);
   update public.ar_invoice_workflow set first_billing_date=floor_day,revision=revision+1,updated_at=now() where hotel=event.hotel and account_id=event.account_id and invoice_id=invoice and floor_day is not null and (first_billing_date is null or first_billing_date>floor_day) returning * into w;
   if found then insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details) values(w.hotel,w.account_id,w.invoice_id,w.revision,event.owner,to_jsonb(w)||jsonb_build_object('source','confirmed_first_billing_guard','delivery_id',event.delivery_id));end if;
  end loop;
 end loop;return new;
end$$;

-- Preserve normal recorded labels, use each frozen combined manifest/workflow.
do $$declare definition text:=pg_get_viewdef('ar_private.report_sent_invoices'::regclass,true);begin
 definition:=regexp_replace(definition,'\m(public\.)?ar_sent_events e\M','ar_private.sent_scope_facts e','g');
 definition:=replace(definition,'e.account_name_recorded',$q$(select s.account_name_recorded from public.ar_sent_events s where s.delivery_id=e.delivery_id)$q$);
 definition:=replace(definition,'e.account_type_recorded',$q$(select s.account_type_recorded from public.ar_sent_events s where s.delivery_id=e.delivery_id)$q$);
 definition:=replace(definition,$q$'Not recorded'::text$q$,$q$coalesce((select b.member_snapshot->>'accountType' from ar_private.combined_delivery_members b where b.delivery_id=e.delivery_id and b.member_id=e.member_id),'Not recorded'::text)$q$);
 definition:=replace(definition,$q$m.snapshot -> 'manifest'::text$q$,'e.manifest');
 definition:=replace(definition,$q$m.snapshot -> 'workflow'::text$q$,'e.workflow');
 definition:=replace(definition,$q$(m.snapshot -> 'draft'::text) ->> 'account_name'::text$q$,$q$coalesce((select b.member_snapshot->>'accountName' from ar_private.combined_delivery_members b where b.delivery_id=e.delivery_id and b.member_id=e.member_id),(m.snapshot->'draft'->>'account_name'))$q$);
 execute 'create or replace view ar_private.report_sent_invoices as '||definition;
end$$;

-- Derive all shared access scopes from owned immutable jobs/members. The
-- installed access function still owns regional grants and mailbox enablement.
do $$declare definition text:=pg_get_functiondef('public.ar_access_authorize(uuid,text,text,text,uuid,boolean,text,text)'::regprocedure);needle text;begin
 needle:=$n$elsif p_kind='delivery' then$n$;
 if strpos(definition,needle)=0 then raise exception 'combined_access_definition_drift';end if;
 definition:=replace(definition,needle,$n$elsif p_kind='combined' then
  select array_agg(distinct j.hotel) into scoped from ar_private.combined_email_preparations c cross join lateral jsonb_array_elements(c.members) b
  join public.ar_document_jobs j on j.id=(b->>'documentJobId')::uuid and j.owner=owner_id where c.id=p_ref and c.owner=owner_id;
  if scoped is null or (select count(*) from ar_private.combined_email_preparations c cross join lateral jsonb_array_elements(c.members) b where c.id=p_ref and c.owner=owner_id)<>(select count(*) from ar_private.combined_email_preparations c cross join lateral jsonb_array_elements(c.members) b join public.ar_document_jobs j on j.id=(b->>'documentJobId')::uuid and j.owner=owner_id where c.id=p_ref and c.owner=owner_id) then raise exception 'access_forbidden';end if;
 elsif p_kind='delivery' and exists(select 1 from ar_private.mail_deliveries m where m.id=p_ref and m.owner=owner_id and m.combined_preparation_id is not null) then
  select array_agg(distinct b.hotel) into scoped from ar_private.combined_delivery_members b where b.delivery_id=p_ref and b.owner=owner_id;
  if scoped is null or exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=p_ref and b.owner<>owner_id) then raise exception 'access_forbidden';end if;
 elsif p_kind='delivery' then$n$);
 execute definition;
end$$;

create or replace function ar_private.document_pending_mail(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.ar_email_drafts d join ar_private.mail_deliveries m on m.draft_id=d.id where d.document_job_id=p_job and m.state<>'sent')
 or exists(select 1 from public.ar_email_drafts d join ar_private.gmail_draft_attempts g on g.draft_id=d.id where d.document_job_id=p_job and not exists(select 1 from ar_private.mail_deliveries m where m.draft_id=d.id and m.revision=g.revision and m.state='sent'))
 or exists(select 1 from ar_private.combined_delivery_members b join ar_private.mail_deliveries m on m.id=b.delivery_id where b.document_job_id=p_job and (m.state<>'sent' or (select count(*) from ar_private.combined_sent_scopes s where s.delivery_id=m.id)<>(select count(*) from ar_private.combined_delivery_members x where x.delivery_id=m.id)));
$$;
create function ar_private.document_combined_attempted(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from ar_private.combined_delivery_members where document_job_id=p_job);
$$;
revoke all on function ar_private.document_combined_attempted(uuid) from public,anon,authenticated,service_role;
create or replace function ar_private.document_close_sent() returns trigger language plpgsql security definer set search_path='' as $$
declare jid uuid;begin
 if new.state='sent' and old.state<>'sent' and new.mode<>'test' then
  for jid in select document_job_id from public.ar_email_drafts where id=new.draft_id
   union select document_job_id from ar_private.combined_delivery_members where delivery_id=new.id loop
   if not ar_private.document_pending_mail(jid) then update public.ar_document_jobs set closed_at=clock_timestamp(),closed_reason='sent' where id=jid and lifecycle='transient' and closed_at is null;end if;
  end loop;
 end if;return new;
end$$;

do $$declare definition text;begin
 definition:=pg_get_viewdef('ar_private.retention_storage_references'::regclass,true);
 definition:=rtrim(definition,E';\n ');
 execute 'create or replace view ar_private.retention_storage_references as '||definition||$v$
 union select e->>'storage_key',b.owner,b.hotel,b.account_id,b.invoice_ids,'combined_delivery',b.delivery_id
 from ar_private.combined_delivery_members b cross join lateral jsonb_array_elements(coalesce(b.member_snapshot#>'{draft,exports}','[]')||coalesce(b.member_snapshot#>'{draft,attachments}','[]'))e where e->>'storage_key' is not null$v$;
 -- Pending ordinary consumers already call document_pending_mail. Immutable
 -- attempt evidence also forbids discard-text cleanup/unused retirement.
 definition:=pg_get_functiondef('ar_private.unused_preparation_problem(uuid,uuid)'::regprocedure);
 definition:=replace(definition,$q$if j.closed_reason='sent' or$q$, $q$if ar_private.document_combined_attempted(j.id) or j.closed_reason='sent' or$q$);execute definition;
 definition:=pg_get_functiondef('ar_private.scrub_discarded_messages(uuid,uuid,integer)'::regprocedure);
 definition:=replace(definition,'if not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=jid)', 'if not ar_private.document_combined_attempted(jid) and not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=jid)');execute definition;
 definition:=pg_get_functiondef('ar_private.document_transient_reference_guard()'::regprocedure);
 definition:=replace(definition,$q$and not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=j.id)$q$,$q$and not ar_private.document_combined_attempted(j.id) and not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=j.id)$q$);execute definition;
end$$;

-- Legacy/Drive/remittance keep their existing verified-zero/calendar-month
-- policy, while a fully confirmed shared message satisfies its member draft.
create function ar_private.combined_draft_sent(p_draft uuid,p_revision integer) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from ar_private.combined_delivery_members b join ar_private.mail_deliveries m on m.id=b.delivery_id
 where b.draft_id=p_draft and b.draft_revision=p_revision and m.state='sent'
 and (select count(*) from ar_private.combined_sent_scopes s where s.delivery_id=m.id)=(select count(*) from ar_private.combined_delivery_members x where x.delivery_id=m.id));
$$;
revoke all on function ar_private.combined_draft_sent(uuid,integer) from public,anon,authenticated,service_role;
do $$declare definition text:=pg_get_functiondef('ar_private.retention_eligibility(uuid,jsonb,integer)'::regprocedure);needle text;begin
 needle:=$q$and not exists(select 1 from ar_private.mail_deliveries m where m.owner=p_actor and m.draft_id=d.id and m.revision=d.revision and m.state='sent' and m.mode in('send','draft'))$q$;
 if strpos(definition,needle)=0 then raise exception 'combined_legacy_retention_definition_drift';end if;
 definition:=replace(definition,needle,needle||' and not ar_private.combined_draft_sent(d.id,d.revision)');
 needle:='  if e.invoice_id is not null then';
 if strpos(definition,needle)=0 then raise exception 'combined_retention_activity_definition_drift';end if;
 definition:=replace(definition,needle,$q$  select greatest(floor,max(greatest(m.created_at,m.sent_at))) into floor from ar_private.sent_scope_facts s join ar_private.mail_deliveries m on m.id=s.delivery_id and m.state='sent' where s.owner=p_actor and s.hotel=i.hotel and s.account_id=i.account_id and i.id=any(s.invoice_ids);
  if e.invoice_id is not null then$q$);
 execute definition;
end$$;

-- A combined storage reference resolves the matching member job, never the
-- absent root draft or the first member. All matching references must close.
do $$declare oid regprocedure;definition text;needle text;begin
 for oid in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_private' and p.proname in('retention_transient_eligibility','retention_transient_before_unused') loop
  definition:=pg_get_functiondef(oid);needle:=$n$elsif r.kind='mail_delivery' then$n$;
  if strpos(definition,needle)>0 then
   definition:=replace(definition,needle,$n$elsif r.kind='combined_delivery' then
   select * into m from ar_private.mail_deliveries where id=r.reference_id;
   if m.state<>'sent' then return jsonb_build_object('error','retention_pending_mail');end if;
   if exists(select 1 from ar_private.combined_delivery_members b join public.ar_document_jobs q on q.id=b.document_job_id where b.delivery_id=m.id and (q.owner<>p_actor or q.lifecycle<>'transient' or q.closed_at is null or ar_private.document_pending_mail(q.id))) then return jsonb_build_object('error','retention_shared_reference');end if;
   select q.* into other_job from public.ar_document_jobs q join ar_private.combined_delivery_members b on b.document_job_id=q.id where b.delivery_id=m.id and b.hotel=r.hotel and b.account_id=r.account_id order by q.closed_at desc limit 1;
   elsif r.kind='mail_delivery' then$n$);execute definition;
  end if;
 end loop;
end$$;

-- Guards cover new references as well as reads of existing shared packages.
create function ar_private.combined_reference_guard() returns trigger language plpgsql set search_path='' as $$
declare b jsonb;j public.ar_document_jobs;begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if tg_table_name='combined_email_preparations' then
  if tg_op='UPDATE' and old.closed_at is not null then
   if new is distinct from old then raise exception 'document_closed';end if;return new;
  end if;
  if new.closed_at is not null then
   if tg_op<>'UPDATE' or new.closed_reason<>'discarded' or new.content<>'{}'::jsonb or new.members is distinct from ar_private.combined_closed_members(old.members)
    or (to_jsonb(new)-array['members','content','closed_at','closed_reason','updated_at']) is distinct from (to_jsonb(old)-array['members','content','closed_at','closed_reason','updated_at'])
    or not ar_private.combined_preparation_discardable(old.id,old.owner) then raise exception 'document_closed';end if;
   return new;
  end if;
 end if;
 if tg_table_name='combined_delivery_members' then
  select * into j from public.ar_document_jobs where id=new.document_job_id and owner=new.owner;
  if j.id is null or j.closed_at is not null or exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id) then raise exception 'document_closed';end if;
 else
  for b in select value from jsonb_array_elements(new.members) loop
   select * into j from public.ar_document_jobs where id=(b->>'documentJobId')::uuid and owner=new.owner;
   if j.id is null or j.closed_at is not null or exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id) then raise exception 'document_closed';end if;
  end loop;
 end if;return new;
end$$;
create trigger combined_reference_guard before insert or update on ar_private.combined_email_preparations for each row execute function ar_private.combined_reference_guard();
create trigger combined_reference_guard before insert on ar_private.combined_delivery_members for each row execute function ar_private.combined_reference_guard();
revoke all on function ar_private.combined_reference_guard() from public,anon,authenticated,service_role;

-- Account evidence links each member back to its one real shared root.
do $$declare definition text:=pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure);begin
 definition:=replace(definition,'from public.ar_sent_events e','from ar_private.sent_scope_facts e');
 definition:=replace(definition,'select j.id,j.lifecycle','select j.id,j.id as job_id,j.lifecycle');
 definition:=replace(definition,'j.statement_source,cardinality(j.invoice_ids) as invoice_count','j.statement_source,j.invoice_ids,cardinality(j.invoice_ids) as invoice_count,(select b.stage from ar_private.combined_delivery_members b where b.delivery_id=m.id and b.draft_id=d.id) as member_stage');
 definition:=replace(definition,'d.subject,','coalesce((select md.snapshot#>>''{expected,subject}'' from ar_private.mail_deliveries md where md.id=m.id and md.combined_preparation_id is not null),d.subject) as subject,');
 definition:=replace(definition,'d.document_job_id as job_id','e.document_job_id as job_id');
 definition:=replace(definition,$q$'sent:'||e.delivery_id as id$q$,$q$'sent:'||e.delivery_id||coalesce(':'||e.member_id,'') as id$q$);
 definition:=replace(definition,$q$m.snapshot->'draft'->>'subject'$q$,$q$coalesce(m.snapshot#>>'{expected,subject}',m.snapshot->'draft'->>'subject')$q$);
 definition:=replace(definition,$q$m.snapshot->'draft'->>'body'$q$,$q$coalesce(m.snapshot#>>'{expected,body}',m.snapshot->'draft'->>'body')$q$);
 definition:=replace(definition,$q$m.snapshot->'draft'->'recipients'$q$,$q$coalesce(m.snapshot#>'{expected,recipients}',m.snapshot->'draft'->'recipients')$q$);
 definition:=replace(definition,$q$'subject',coalesce(m.snapshot#>>'{expected,subject}',m.snapshot->'draft'->>'subject')$q$,$q$'deliveryId',e.delivery_id,'memberId',e.member_id,'combinedPreparationId',e.combined_preparation_id,'draftId',e.draft_id,'subject',coalesce(m.snapshot#>>'{expected,subject}',m.snapshot->'draft'->>'subject')$q$);
 definition:=replace(definition,'m.id as delivery_id,m.mode as delivery_mode','m.id as delivery_id,m.combined_preparation_id,(select b.member_id from ar_private.combined_delivery_members b where b.delivery_id=m.id and b.draft_id=d.id) as member_id,m.mode as delivery_mode');
 definition:=replace(definition,'select id,mode,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries','select id,combined_preparation_id,mode,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries');
 definition:=replace(definition,'where owner=p_actor and draft_id=d.id order by created_at desc,id desc limit 1', 'where owner=p_actor and (draft_id=d.id or exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=ar_private.mail_deliveries.id and b.draft_id=d.id and b.owner=p_actor)) order by created_at desc,id desc limit 1');
 -- Group the shared root BEFORE counting/paging account email records. Keep
 -- each member's purpose/stage/Invoice list instead of flattening to the first.
 definition:=replace(definition,$q$) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (select * from entries order by created_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from entries)) into result;$q$,$q$), records as materialized (
  select case when p_section='email_records' and e.combined_preparation_id is not null then e.delivery_id else e.id end as id,min(e.created_at) as created_at,
   (array_agg(to_jsonb(e) order by e.created_at,e.id))[1]||jsonb_build_object(
    'id',case when p_section='email_records' and e.combined_preparation_id is not null then e.delivery_id else e.id end,
    'combined',e.combined_preparation_id is not null,'invoice_count',sum(e.invoice_count),'member_id',case when count(*)=1 then min(e.member_id) end,'purpose',case when count(distinct e.purpose)=1 then min(e.purpose) else 'mixed' end,
    'member_ids',coalesce(jsonb_agg(e.member_id order by e.member_id) filter(where e.member_id is not null),'[]'),
    'job_ids',jsonb_agg(e.job_id order by e.job_id),
    'members',jsonb_agg(jsonb_build_object('member_id',e.member_id,'job_id',e.job_id,'draft_id',e.draft_id,'purpose',e.purpose,'stage',e.member_stage,'invoice_ids',e.invoice_ids,'layout',e.layout) order by e.member_id),
    'invoice_ids',jsonb_path_query_array(jsonb_agg(to_jsonb(e.invoice_ids) order by e.member_id),'$[*][*]')) as value
  from entries e group by case when p_section='email_records' and e.combined_preparation_id is not null then e.delivery_id else e.id end,e.combined_preparation_id
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(r.value order by r.created_at desc,r.id) from (select * from records order by created_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from records)) into result;$q$);
 execute definition;
end$$;
