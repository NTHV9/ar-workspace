-- Operational access is read-only; provider writes use existing reviewed commands.
create function public.ar_operations_queue(p_actor uuid,p_kind text default 'all',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','operations_forbidden');end if;
 if p_kind is null or p_kind not in('all','document','email','archive','refresh','financial') or p_offset is null or p_offset<0 then return jsonb_build_object('error','operations_invalid');end if;
 with latest_refresh as(select distinct on(hotel) * from ar_private.refresh_runs order by hotel,created_at desc),latest_financial as(select distinct on(hotel) * from ar_private.financial_runs order by hotel,created_at desc),items as(
  select 'document'::text as kind,j.id::text,j.hotel,j.account_name as label,j.state,j.updated_at as updated_at,j.id as job_id,null::uuid as delivery_id,null::integer as revision,
   coalesce((select min(f.error_code) from public.ar_document_files f where f.job_id=j.id and f.error_code is not null),case when j.state='ready' then 'document_review_pending' else 'document_processing' end) as reason
  from public.ar_document_jobs j where j.owner=p_actor and (j.state<>'ready' or not j.acknowledged)
  union all
  select 'email',m.id::text,m.snapshot->'draft'->>'hotel',coalesce(d.account_name,'Synthetic email test'),m.state,m.created_at,d.document_job_id,m.id,m.revision,m.reason
  from ar_private.mail_deliveries m left join public.ar_email_drafts d on d.id=m.draft_id where m.owner=p_actor and m.state<>'sent'
  union all
  select 'archive',a.id::text,j.hotel,coalesce(j.account_name,'Synthetic archive test'),'attention',a.created_at,a.document_job_id,null::uuid,a.document_revision,min(f.error_code)
  from ar_private.drive_archives a join ar_private.drive_archive_files f on f.archive_id=a.id left join public.ar_document_jobs j on j.id=a.document_job_id
  where a.owner=p_actor and f.state not in('verified','trashed') group by a.id,j.hotel,j.account_name
  union all
  select 'refresh',r.id::text,r.hotel,'Current OPERA data',r.status,r.created_at,null::uuid,null::uuid,null::integer,r.error_code from latest_refresh r where r.status<>'succeeded'
  union all
  select 'financial',r.id::text,r.hotel,'OPERA financial history',r.status,r.created_at,null::uuid,null::uuid,null::integer,r.error_code from latest_financial r where r.status<>'succeeded'
 ),filtered as materialized(select * from items where p_kind='all' or kind=p_kind),page as(select * from filtered order by updated_at desc,kind,id offset p_offset limit 50)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.kind,p.id) from page p),'[]'::jsonb),'scope','pending_work_and_latest_source_runs') into result;return result;
end$$;
create function public.ar_recovery_sent_match(p_actor uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;result jsonb:='[]';d ar_private.mail_deliveries;matched_delivery_id uuid;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','operations_forbidden');end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>50 then return jsonb_build_object('error','operations_invalid');end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'deliveryId','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(r->>'gmailId','')!~'^[A-Za-z0-9_-]{1,200}$' then return jsonb_build_object('error','operations_invalid');end if;
  matched_delivery_id:=(r->>'deliveryId')::uuid;select * into d from ar_private.mail_deliveries where mail_deliveries.id=matched_delivery_id and owner=p_actor;
  result:=result||jsonb_build_array(jsonb_build_object('deliveryId',matched_delivery_id,'gmailId',r->>'gmailId','sentAt',r->>'sentAt','state',case when not found then 'missing_receipt' when d.state='sent' and d.gmail_id=r->>'gmailId' then 'recorded' else 'needs_reconciliation' end,'mode',d.mode));
 end loop;return result;
end$$;
revoke all on function public.ar_operations_queue(uuid,text,integer),public.ar_recovery_sent_match(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_operations_queue(uuid,text,integer),public.ar_recovery_sent_match(uuid,jsonb) to service_role;
