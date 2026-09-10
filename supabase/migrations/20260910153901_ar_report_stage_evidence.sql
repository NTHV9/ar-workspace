-- Read projections use immutable captured stage evidence.
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
 case when e.purpose='collection' then coalesce((e.stage_snapshot->>'terminal')::boolean,e.stage='Final') else false end as terminal_stage
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in ('send','draft')
 cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 left join lateral (select value as item from jsonb_array_elements(m.snapshot->'manifest') where value->>'id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) manifest on true
 left join lateral (select value as fact from jsonb_array_elements(m.snapshot->'workflow') where value->>'invoice_id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) w on true;

-- A workflow audit written by verified Gmail sending is already represented by its SENT event.
do $$
declare definition text;needle text:='where h.hotel=p_hotel and h.account_id=p_account and h.actor=p_actor';
begin
 definition:=pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'review current account history projection';end if;
 definition:=replace(definition,needle,needle||' and h.details->>''source'' is distinct from ''gmail_sent''');execute definition;
end $$;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure);
 if strpos(definition,'select kind,sent_at from ar_private.report_sent_invoices')=0 or strpos(definition,'latest.sent_at as last_sent_at')=0 then raise exception 'review current report stage projection';end if;
 definition:=replace(definition,'select kind,sent_at from ar_private.report_sent_invoices','select kind,sent_at,stage_snapshot,stage_label,terminal_stage from ar_private.report_sent_invoices');
 definition:=replace(definition,'latest.sent_at as last_sent_at','latest.sent_at as last_sent_at,latest.stage_snapshot as latest_stage_snapshot,latest.stage_label as latest_stage_label,coalesce(latest.terminal_stage,false) as latest_terminal');
 definition:=replace(definition,'where latest_stage=''Final''','where latest_terminal');execute definition;
end $$;
