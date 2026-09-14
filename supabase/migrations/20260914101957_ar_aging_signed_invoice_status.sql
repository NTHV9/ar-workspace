-- Aging counts the same verified nonzero root identities as Portfolio, including credits.
-- Credits contribute signed amounts and display-only status facets, never collection tasks.
-- Preserve actor/publication checks and verified same-publication zero-parent child evidence.
create or replace function public.ar_aging_invoice_status(p_actor uuid,p_hotel text default null,p_type text default null,p_kat_account text default null,p_tsk_account text default null,p_bucket jsonb default null,p_dimension text default null,p_status text default null,p_details boolean default false,p_offset integer default 0,p_limit integer default 50,p_flag text default null,p_accounts jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date:=(now() at time zone 'Asia/Bangkok')::date;result jsonb;account_rows jsonb;source_rows jsonb;pub jsonb;valid boolean;missing boolean;field text;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','aging_forbidden');end if;
 if p_hotel is not null and p_hotel not in('KAT','TSK') or p_hotel='KAT' and p_tsk_account is not null or p_hotel='TSK' and p_kat_account is not null
  or p_details is null or p_offset is null or p_offset not between 0 and 20000000 or p_limit is null or p_limit not between 1 and 200
  or p_dimension is not null and p_dimension not in('billing','followup','due','flags') or (p_dimension is null)<>(p_status is null)
  or p_flag is not null and p_flag not in('held','needs_review') then return jsonb_build_object('error','aging_invalid');end if;
 foreach field in array array[p_type,p_kat_account,p_tsk_account] loop
  if field is not null and (length(field) not between 1 and 200 or field<>btrim(field) or field~'[[:cntrl:]]') then return jsonb_build_object('error','aging_invalid');end if;
 end loop;
 if p_status is not null and not(case p_dimension when 'billing' then p_status in('unbilled','billed','not_required','setup','credit') when 'due' then p_status in('not_due','due_today','past_due','awaiting_billing','unknown','credit') when 'flags' then p_status in('held','needs_review') when 'followup' then p_status in('none','unknown','credit') or p_status~'^(Friendly|Follow 1|Follow 2|Follow 3|Final|round_[a-z0-9][a-z0-9_-]{0,63})$' else false end) then return jsonb_build_object('error','aging_invalid');end if;
 if p_accounts is not null then
  if p_kat_account is not null or p_tsk_account is not null or jsonb_typeof(p_accounts) is distinct from 'array' then return jsonb_build_object('error','aging_invalid');end if;
  if jsonb_array_length(p_accounts) not between 1 and 200 then return jsonb_build_object('error','aging_invalid');end if;
  if exists(select 1 from jsonb_array_elements(p_accounts)x where jsonb_typeof(x) is distinct from 'array' or jsonb_array_length(x)<>2 or x->>0 not in('KAT','TSK') or jsonb_typeof(x->0) is distinct from 'string' or jsonb_typeof(x->1) is distinct from 'string' or length(x->>1) not between 1 and 200 or x->>1<>btrim(x->>1) or x->>1~'[[:cntrl:]]' or p_hotel is not null and x->>0<>p_hotel) or (select count(distinct x) from jsonb_array_elements(p_accounts)x)<>jsonb_array_length(p_accounts) then return jsonb_build_object('error','aging_invalid');end if;
 end if;
 if p_bucket is not null then
  if jsonb_typeof(p_bucket) is distinct from 'array' or jsonb_array_length(p_bucket)<>4 then return jsonb_build_object('error','aging_invalid');end if;
  if not ar_private.aging_schema_valid(jsonb_build_array(jsonb_build_object('label',p_bucket->0,'start',p_bucket->1,'end',p_bucket->2,'sequence',p_bucket->3,'amount',0,'debit',0,'credit',0))) then return jsonb_build_object('error','aging_invalid');end if;
 end if;
 if (select count(*) from public.ar_accounts a where (p_hotel is null or a.hotel=p_hotel) and (p_type is null or a.type=p_type))>2000 then return jsonb_build_object('error','aging_unavailable');end if;
 select jsonb_agg(jsonb_build_object('hotel',h.hotel,'sourceAt',s.last_success_at) order by h.hotel),coalesce(bool_or(s.last_success_at is null),true)
 into pub,missing from(values('KAT'::text),('TSK'::text))h(hotel) left join public.ar_refresh_state s on s.hotel=h.hotel
 where (p_accounts is null or exists(select 1 from jsonb_array_elements(p_accounts)x where x->>0=h.hotel)) and (p_hotel is null or h.hotel=p_hotel) and (p_kat_account is null and p_tsk_account is null or h.hotel='KAT' and p_kat_account is not null or h.hotel='TSK' and p_tsk_account is not null);
 -- All invoice rows are read once in the same MVCC snapshot as account publications.
 with accounts as materialized(select a.*,ar_private.aging_schema_valid(a."agingBuckets") as schema_valid from public.ar_accounts a
 where (p_hotel is null or a.hotel=p_hotel) and (p_type is null or a.type=p_type)
 and (p_accounts is null or exists(select 1 from jsonb_array_elements(p_accounts)x where x->>0=a.hotel and x->>1=a.id))
 and (p_kat_account is null and p_tsk_account is null or a.hotel='KAT' and a.id=p_kat_account or a.hotel='TSK' and a.id=p_tsk_account)),
 source as materialized(select i.*,a.name as account_name,a.type as account_type,a.synced_at as account_synced,a.schema_valid,
 a.verification_state='verified' or a.verification_state='cleared' and a.open=0 as account_verified,
 w.billing_required,w.first_billing_date,w.due_date,
 case when w.last_reminder_stage is not null and (w.last_reminder_date is null or w.last_reminder_date>d) and c.latest_stage is null then 'unknown' when w.last_reminder_date<=d and (c.latest_sent_at is null or w.last_reminder_date>(c.latest_sent_at at time zone 'Asia/Bangkok')::date) then w.last_reminder_stage else c.latest_stage end as stage,
 case when w.last_reminder_stage is not null and (w.last_reminder_date is null or w.last_reminder_date>d) and c.latest_stage is null then 'Follow-Up needs review' when w.last_reminder_date<=d and (c.latest_sent_at is null or w.last_reminder_date>(c.latest_sent_at at time zone 'Asia/Bangkok')::date) then coalesce(w.last_reminder_stage_snapshot->>'label',w.last_reminder_stage) else c.latest_stage_label end as stage_label,
 coalesce(e.held,false) as held,coalesce(e.needs_review,false) or w.last_reminder_stage is not null and (w.last_reminder_date is null or w.last_reminder_date>d) as needs_review,
 coalesce((i.verification_state='verified' or i.verification_state='cleared' and i.open=0) and i.collection_role in('standalone','parent') and i.parent_invoice_id is null,false) as root,
 coalesce((i.verification_state='verified' or i.verification_state='cleared' and i.open=0) and i.collection_role='child' and (
  exists(select 1 from public.ar_invoices par where par.hotel=i.hotel and par.account_id=i.account_id and par.id=i.parent_invoice_id and par.collection_role='parent' and par.parent_invoice_id is null and (par.verification_state='verified' or par.verification_state='cleared' and par.open=0))
  -- The ingestion resolver proves the unique parent from the same scoped history.
  -- A verified zero parent need not appear in the current nonzero source snapshot.
  or i.verification_state='verified' and a.verification_state='verified' and i.parent_open=0 and i.compressed=false
   and nullif(btrim(i.parent_invoice_id),'') is not null and i.parent_invoice_id<>i.id and nullif(btrim(i.parent_invoice_no),'') is not null
   and i.synced_at=a.synced_at
   and not exists(select 1 from public.ar_invoices par where par.hotel=i.hotel and par.account_id=i.account_id and (par.id=i.parent_invoice_id or par.invoice_no=i.parent_invoice_no))
 ),false) as child,
 bk.matches,bk.bucket from public.ar_invoices i join accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 left join ar_private.dashboard_current_invoices c on c.hotel=i.hotel and c.account_id=i.account_id and c.invoice_id=i.id
 left join public.ar_invoice_exceptions e on e.hotel=i.hotel and e.account_id=i.account_id and e.invoice_id=i.id
 left join lateral(select count(*) as matches,jsonb_agg(jsonb_build_array(b->'label',b->'start',b->'end',b->'sequence'))->0 as bucket
 from jsonb_array_elements(case when a.schema_valid then a."agingBuckets" else '[]'::jsonb end)b
 where i.age>=(b->>'start')::numeric and (b->'end'='null'::jsonb or i.age<=(b->>'end')::numeric))bk on true),
 quality as(select a.hotel,a.id,count(s.id) filter(where not s.child and not(s.verification_state in('verified','cleared') and s.open=0) and (not s.root or not s.account_verified)) as unverified,
 count(s.id) filter(where s.root and s.open>0 and (not a.schema_valid or s.matches<>1)) as unassigned,
 count(s.id) filter(where s.root and s.open<0 and (not a.schema_valid or s.matches<>1)) as credit_unassigned
 from accounts a left join source s on s.hotel=a.hotel and s.account_id=a.id group by a.hotel,a.id),
 measures as(select a.hotel,a.id,null::jsonb as bucket from accounts a union all select a.hotel,a.id,jsonb_build_array(b->'label',b->'start',b->'end',b->'sequence') from accounts a cross join lateral jsonb_array_elements(case when a.schema_valid then a."agingBuckets" else '[]'::jsonb end)b),
 counts as(select m.hotel,m.id,m.bucket,
 exists(select 1 from public.ar_refresh_state rs where rs.hotel=a.hotel and rs.last_success_at is not null) and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0) and q.unverified=0 and (m.bucket is null or a.schema_valid and q.unassigned=0 and q.credit_unassigned=0) as complete,
 (m.bucket is null or a.schema_valid and q.credit_unassigned=0) as credit_complete,
 count(s.id) filter(where s.root and s.open<>0) as count,coalesce(sum(s.open) filter(where s.root and s.open<>0),0) as amount,
 coalesce(sum(-s.open) filter(where s.root and s.open<0),0) as credit
 from measures m join accounts a on a.hotel=m.hotel and a.id=m.id join quality q on q.hotel=m.hotel and q.id=m.id
 left join source s on s.hotel=m.hotel and s.account_id=m.id and (m.bucket is null or s.matches=1 and s.bucket=m.bucket)
 group by a.hotel,m.hotel,m.id,m.bucket,a.verification_state,a.open,q.unverified,a.schema_valid,q.unassigned,q.credit_unassigned),
 packed as(select a.hotel,a.id,a.type,a.synced_at,q.unverified,exists(select 1 from public.ar_refresh_state rs where rs.hotel=a.hotel and rs.last_success_at is not null) and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0) and q.unverified=0 as complete,
 jsonb_agg(jsonb_build_object('key',c.bucket::text,'complete',c.complete,'count',case when c.complete then c.count end,'amount',case when c.complete then ar_private.financial_money(c.amount) end,'creditAmount',case when c.complete and c.credit_complete then ar_private.financial_money(c.credit) end) order by c.bucket nulls first) as buckets
 from accounts a join quality q on q.hotel=a.hotel and q.id=a.id join counts c on c.hotel=a.hotel and c.id=a.id group by a.hotel,a.id,a.type,a.synced_at,q.unverified,a.verification_state,a.open)
 select (select coalesce(jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',id,'accountType',type,'syncedAt',synced_at,'complete',complete,'unverified',unverified,'buckets',buckets) order by hotel,id),'[]') from packed),
 (select coalesce(jsonb_agg(jsonb_build_object('hotel',s.hotel,'accountId',s.account_id,'accountName',s.account_name,'accountType',s.account_type,'invoiceId',s.id,'invoiceNo',s.invoice_no,'folioNo',s.folio_no,'guest',s.guest,'open',ar_private.financial_money(s.open),'age',s.age,
 'billingStatus',case when s.open<0 then 'credit' when s.billing_required is null then 'setup' when not s.billing_required then 'not_required' when s.first_billing_date<=d then 'billed' else 'unbilled' end,
 'latestStage',case when s.open<0 then 'credit' else coalesce(s.stage,'none') end,'latestStageLabel',case when s.open<0 then 'Credit' else coalesce(s.stage_label,'No Follow-Up') end,
 'dueStatus',case when s.open<0 then 'credit' when s.billing_required and (s.first_billing_date is null or s.first_billing_date>d) then 'awaiting_billing' when s.due_date is null then 'unknown' when s.due_date<d then 'past_due' when s.due_date=d then 'due_today' else 'not_due' end,'dueDate',case when s.open<0 then null else s.due_date end,'held',s.held,'needsReview',s.needs_review)),'[]') from source s where s.root and s.account_verified and s.open<>0 and (p_bucket is null or s.schema_valid and s.matches=1 and s.bucket=p_bucket)) into account_rows,source_rows;
 if p_accounts is not null and exists(select 1 from jsonb_array_elements(p_accounts)x where not exists(select 1 from jsonb_array_elements(account_rows)a where a->>'hotel'=x->>0 and a->>'accountId'=x->>1)) then missing:=true;end if;
 valid:=not missing and not exists(select 1 from jsonb_array_elements(account_rows)a where not(a->>'complete')::boolean or not exists(select 1 from jsonb_array_elements(a->'buckets')b where (p_bucket is null and b->'key'='null'::jsonb or p_bucket is not null and (b->>'key')::jsonb=p_bucket) and (b->>'complete')::boolean));
 if p_kat_account is not null and not exists(select 1 from jsonb_array_elements(account_rows)a where a->>'hotel'='KAT' and a->>'accountId'=p_kat_account) or p_tsk_account is not null and not exists(select 1 from jsonb_array_elements(account_rows)a where a->>'hotel'='TSK' and a->>'accountId'=p_tsk_account) then valid:=false;end if;
 with rows as materialized(select value as r from jsonb_array_elements(source_rows)),
 keys as(select * from(values('billing','unbilled','Not billed'),('billing','billed','Billed'),('billing','not_required','Billing not required'),('billing','setup','Billing setup needed'),('billing','credit','Credit'),('due','not_due','Not due'),('due','due_today','Due today'),('due','past_due','Past Due date'),('due','awaiting_billing','Awaiting billing'),('due','unknown','Due date unavailable'),('due','credit','Credit'),('flags','held','On hold'),('flags','needs_review','Needs review'),('followup','none','No Follow-Up'),('followup','Friendly','Friendly'),('followup','Follow 1','Follow-Up 1'),('followup','Follow 2','Follow-Up 2'),('followup','Follow 3','Follow-Up 3'),('followup','Final','Final'),('followup','credit','Credit'))k(dimension,key,label)
 union all select 'followup',key,label from(select distinct on(r->>'latestStage') r->>'latestStage' as key,r->>'latestStageLabel' as label from rows where r->>'latestStage' not in('none','Friendly','Follow 1','Follow 2','Follow 3','Final','credit') order by r->>'latestStage',r->>'latestStageLabel') custom),
 facets as(select k.dimension,k.key,case when k.dimension='followup' then coalesce((select x.r->>'latestStageLabel' from rows x where x.r->>'latestStage'=k.key order by x.r->>'latestStageLabel' limit 1),k.label) else k.label end as label,case when valid then count(r.r) end as count,case when valid then ar_private.financial_money(coalesce(sum((r.r->>'open')::numeric),0)) end as amount from keys k left join rows r on case k.dimension when 'billing' then r.r->>'billingStatus'=k.key when 'followup' then r.r->>'latestStage'=k.key when 'due' then r.r->>'dueStatus'=k.key when 'flags' then coalesce((r.r->>case k.key when 'held' then 'held' else 'needsReview' end)::boolean,false) else false end group by k.dimension,k.key,k.label),
 matched as materialized(select r from rows where (p_flag is null or (r->>case p_flag when 'held' then 'held' else 'needsReview' end)::boolean) and (p_dimension is null or case p_dimension when 'billing' then r->>'billingStatus'=p_status when 'followup' then r->>'latestStage'=p_status when 'due' then r->>'dueStatus'=p_status when 'flags' then (r->>case p_status when 'held' then 'held' else 'needsReview' end)::boolean else false end))
 select jsonb_build_object('asOfDate',d,'publications',pub,'accounts',account_rows,'complete',valid,
 'summary',jsonb_build_object('complete',valid,'count',case when valid then (select count(*) from rows) end,'amount',case when valid then ar_private.financial_money(coalesce((select sum((r->>'open')::numeric) from rows),0)) end,
 'creditAmount',case when valid and not exists(select 1 from jsonb_array_elements(account_rows)a cross join lateral jsonb_array_elements(a->'buckets')b where (p_bucket is null and b->'key'='null'::jsonb or p_bucket is not null and (b->>'key')::jsonb=p_bucket) and b->'creditAmount'='null'::jsonb) then ar_private.financial_money(coalesce((select sum((b->>'creditAmount')::numeric) from jsonb_array_elements(account_rows)a cross join lateral jsonb_array_elements(a->'buckets')b where p_bucket is null and b->'key'='null'::jsonb or p_bucket is not null and (b->>'key')::jsonb=p_bucket),0)) end,
 'billing',(select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by array_position(array['unbilled','billed','not_required','setup','credit'],key)) from facets where dimension='billing'),
 'followup',(select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by coalesce(array_position(array['none','Friendly','Follow 1','Follow 2','Follow 3','Final','credit'],key),99),key) from facets where dimension='followup'),
 'due',(select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by array_position(array['not_due','due_today','past_due','awaiting_billing','unknown','credit'],key)) from facets where dimension='due'),
 'flags',(select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by key) from facets where dimension='flags')),
 'total',(select count(*) from matched),'rows',case when p_details then coalesce((select jsonb_agg(r order by (r->>'open')::numeric desc,r->>'hotel',r->>'accountId',r->>'invoiceId') from(select r from matched order by (r->>'open')::numeric desc,r->>'hotel',r->>'accountId',r->>'invoiceId' offset p_offset limit p_limit)p),'[]') else '[]'::jsonb end) into result;
 return result;
end$$;
revoke all on function public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb) to service_role;
