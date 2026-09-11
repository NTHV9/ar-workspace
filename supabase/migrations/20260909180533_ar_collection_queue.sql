create view public.ar_collection_rows with (security_invoker=true) as
 select i.hotel,i.account_id,i.id,i.guest,i.invoice_no,i.folio_no,i.open,i.transaction_date,
 i.collection_role,i.collection_selectable,i.verification_state,a.name as account_name,a.type as account_type,
 case when w.invoice_id is null then null else jsonb_build_object('revision',w.revision,'billing_required',w.billing_required,'credit_term',w.credit_term,'first_billing_date',w.first_billing_date,'last_reminder_stage',w.last_reminder_stage,'last_reminder_date',w.last_reminder_date,'due_date',w.due_date) end as workflow
 from public.ar_invoices i left join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 where i.open>0;
revoke all on public.ar_collection_rows from public,anon;
grant select on public.ar_collection_rows to authenticated;
