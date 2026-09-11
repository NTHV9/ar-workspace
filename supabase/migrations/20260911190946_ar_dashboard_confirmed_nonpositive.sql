-- Source-confirmed nonpositive invoices are outside positive open-debt scope,
-- even when their compression relationship is no longer audited. Unconfirmed
-- source amounts still remain explicit at every value: missing/error is not zero.
-- Preserve all captured history, API contracts, SENT guards and private access.
create or replace view ar_private.dashboard_current_invoices as
 select i.hotel,i.account_id,i.id as invoice_id,a.account_no,a.name as account_name,a.type as account_type,
 i.invoice_no,i.folio_no,i.guest,i.transaction_date,i.open,i.original,i.age,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,
 latest.stage as latest_stage,coalesce(latest.stage_snapshot->>'label',latest.stage) as latest_stage_label,latest.sent_at as latest_sent_at,
 coalesce(i.verification_state='verified' and i.collection_role in('standalone','parent') and a.verification_state='verified',false) as verified
 from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 left join lateral(
  select e.stage,e.stage_snapshot,e.sent_at from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner
  where e.hotel=i.hotel and e.account_id=i.account_id and i.id=any(e.invoice_ids) and e.purpose='collection'
   and m.state='sent' and m.mode in('send','draft') and e.sent_at<=clock_timestamp() and ar_private.financial_actor(e.owner)
  order by e.sent_at desc,e.delivery_id desc limit 1
 ) latest on true
 where i.collection_role<>'child' and (i.open>0 or i.verification_state not in('verified','cleared'));
revoke all on ar_private.dashboard_current_invoices from public,anon,authenticated,service_role;
