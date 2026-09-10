-- Read-only account evidence. Existing event provenance is not reclassified as new activity.
create or replace function public.ar_account_workspace_read(p_actor uuid,p_hotel text,p_account text,p_section text,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','account_workspace_forbidden'); end if;
 if p_hotel is null or p_hotel not in ('KAT','TSK') or p_account is null or length(p_account) not between 1 and 200 or p_section is null or p_section not in ('history','documents') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','account_workspace_invalid'); end if;
 if not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account) then return jsonb_build_object('error','account_workspace_missing'); end if;
 if p_section='history' then
  with entries as materialized (
   select 'sent:'||e.delivery_id as id,e.sent_at as recorded_at,'Verified Gmail send' as source,e.purpose,e.stage,
    (e.sent_at at time zone 'Asia/Bangkok')::date as actual_date,e.invoice_ids, e.open_at_send as amount,
    d.document_job_id as job_id,null::integer as revision,null::date as first_billing_date,null::date as reminder_date,
    jsonb_build_object('subject',m.snapshot->'draft'->>'subject','body',m.snapshot->'draft'->>'body','recipients',m.snapshot->'draft'->'recipients') as message,e.stage_snapshot
   from public.ar_sent_events e left join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner
   left join public.ar_email_drafts d on d.id=m.draft_id and d.owner=e.owner
   where e.owner=p_actor and e.hotel=p_hotel and e.account_id=p_account
   union all
   select 'history:'||h.invoice_id||':'||h.revision,h.recorded_at,'Manual history correction','history',h.details->>'last_reminder_stage',
    null::date,array[h.invoice_id],null::numeric,null::uuid,h.revision,
    (h.details->>'first_billing_date')::date,(h.details->>'last_reminder_date')::date,null::jsonb,h.details->'last_reminder_stage_snapshot'
   from ar_private.invoice_workflow_history h where h.hotel=p_hotel and h.account_id=p_account and h.actor=p_actor and h.details->>'source' is distinct from 'gmail_sent'
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc,r.id) from (select * from entries order by recorded_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from entries)) into result;
 else
  with entries as materialized (
   select j.id,j.created_at,j.updated_at,j.content,j.layout,j.purpose,j.state,j.revision,j.acknowledged,j.statement_source,cardinality(j.invoice_ids) as invoice_count,
    d.id as draft_id,d.revision as draft_revision,d.subject,
    m.id as delivery_id,m.state as delivery_state,m.reason as delivery_reason,m.sent_at,m.reconcile_checked_at,
    coalesce(t.choice->>'threadId','')<>'' as has_thread
   from public.ar_document_jobs j
   left join lateral (select * from public.ar_email_drafts where document_job_id=j.id and owner=p_actor order by document_revision desc,created_at desc,id desc limit 1) d on true
   left join lateral (select id,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries where owner=p_actor and draft_id=d.id order by created_at desc,id desc limit 1) m on true
   left join ar_private.email_thread_choices t on t.draft_id=d.id and t.owner=p_actor
   where j.owner=p_actor and j.hotel=p_hotel and j.account_id=p_account
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (select * from entries order by created_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from entries)) into result;
 end if;
 return result||jsonb_build_object('hotel',p_hotel,'accountId',p_account,'section',p_section,'offset',p_offset,'limit',p_limit);
end $$;
revoke all on function public.ar_account_workspace_read(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ar_account_workspace_read(uuid,text,text,text,integer,integer) to service_role;
