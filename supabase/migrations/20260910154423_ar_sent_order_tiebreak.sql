create or replace view ar_private.report_sent_invoices as
 select e.owner,e.delivery_id,e.hotel,e.account_id,ids.invoice_id,e.sent_at,(e.sent_at at time zone 'Asia/Bangkok')::date as sent_date,
 coalesce(e.account_name_recorded,m.snapshot->'draft'->>'account_name',e.account_id) as account_name,
 coalesce(e.account_type_recorded,'Not recorded') as account_type,
 e.purpose,e.stage,case when e.purpose='billing' then case when w.fact is null then 'Billing classification unavailable' when w.fact->>'first_billing_date' is null then 'First billing' else 'Rebilling' end else e.stage end as kind,
 manifest.item->>'invoice_no' as invoice_no,manifest.item->>'folio_no' as folio_no,
 case when jsonb_typeof(manifest.item->'open')='number' then (manifest.item->>'open')::numeric else null end as amount,
 w.fact->>'first_billing_date' as first_billing_date_before_send,
 e.stage_snapshot,
 case when e.purpose='collection' then coalesce(e.stage_snapshot->>'label',regexp_replace(e.stage,'^Follow ([123])$','Follow-up \1')) else null end as stage_label,
 case when e.purpose='collection' then coalesce((e.stage_snapshot->>'terminal')::boolean,e.stage='Final') else false end as terminal_stage,
 case when w.fact->>'revision' ~ '^[0-9]{1,10}$' then (w.fact->>'revision')::bigint end as workflow_revision_before_send
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in ('send','draft')
 cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 left join lateral (select value as item from jsonb_array_elements(m.snapshot->'manifest') where value->>'id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) manifest on true
 left join lateral (select value as fact from jsonb_array_elements(m.snapshot->'workflow') where value->>'invoice_id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) w on true;


-- Provider send times may tie. The captured per-invoice workflow revision proves
-- command sequence; a random UUID must not choose the current reminder stage.
do $$
declare definition text;needle text:='order by (purpose=''collection'') desc,sent_at desc,delivery_id desc limit 1';
begin
 definition:=pg_get_functiondef('public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'review report event ordering';end if;
 definition:=replace(definition,needle,'order by (purpose=''collection'') desc,sent_at desc,workflow_revision_before_send desc nulls last,delivery_id desc limit 1');execute definition;
end $$;
