-- Read-only source evidence. Replace the INPUT_JSON marker with a SQL-quoted,
-- validated [{workflow,id}] inventory, never provider/user payload or credentials.
-- Every source row remains intact. Unknown or multiply matched identities hold.
with input as (
 select workflow,id from jsonb_to_recordset(/* INPUT_JSON */::jsonb) as i(workflow text,id text)
), source as (
 select 'ar-workspace-refresh'::text workflow,r.id::text id,'terminal_refresh'::text reason
 from ar_private.refresh_runs r where r.status in('succeeded','failed') and r.finished_at is not null and r.finished_at<=clock_timestamp()
 union all
 select 'ar-workspace-refresh',r.id::text||'-scheduled','terminal_refresh'
 from ar_private.refresh_runs r where r.status in('succeeded','failed') and r.finished_at is not null and r.finished_at<=clock_timestamp()
 union all
 select 'ar-workspace-refresh',r.id::text,'terminal_reconcile'
 from ar_private.mail_reconcile_runs r where r.state in('complete','failed') and r.finished_at is not null and r.finished_at<=clock_timestamp()
 union all
 select case when j.execution_queue='documents' then 'ar-workspace-documents' else 'ar-workspace-refresh' end,j.id::text,'closed_document'
 from public.ar_document_jobs j
 where j.execution_queue in('documents','refresh') and j.closed_at is not null and j.closed_at<=clock_timestamp() and j.closed_reason in('sent','discarded')
 and not exists(select 1 from public.ar_document_files f where f.job_id=j.id and f.state in('pending','generating','uncertain'))
 and not exists(select 1 from ar_private.document_transient_uploads u where u.job_id=j.id and not u.registered and not u.cancelled)
 and not exists(select 1 from ar_private.storage_upload_operations u where u.object_key like 'jobs/'||j.id::text||'/%' and not u.origin_finished)
 and not ar_private.document_pending_mail(j.id)
 union all
 select i.workflow,i.id,'obsolete_tracker' from input i
 where i.workflow='ar-workspace-tracker' and not exists(select 1 from ar_private.tracker_wakes w where w.id::text=i.id)
 union all
 select i.workflow,i.id,'terminal_financial' from input i join ar_private.financial_runs r on r.id::text=i.id
 where i.workflow in('ar-workspace-refresh','ar-workspace-financial') and r.status in('succeeded','failed') and r.finished_at is not null and r.finished_at<=clock_timestamp()
), matched as (
 select s.workflow,s.id,min(s.reason) reason from source s join input i using(workflow,id)
 group by s.workflow,s.id having count(*)=1
)
select jsonb_build_object('observedAt',clock_timestamp(),'eligible',coalesce((select jsonb_agg(to_jsonb(m) order by workflow,id) from matched m),'[]'::jsonb)) as proof;
