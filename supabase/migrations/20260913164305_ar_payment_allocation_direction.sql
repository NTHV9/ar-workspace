-- OPERA payment amountUsed/balance may use posting signs or unsigned magnitudes.
-- Keep stored observations untouched. At read time the posting fixes direction:
-- credit postings add allocation; debit corrections subtract it. Neither the
-- posting nor a reconciled allocation is evidence of an invoice application link.
create function ar_private.financial_payment_allocation(p_amount numeric,p_applied numeric,p_unallocated numeric)
 returns table(applied_amount numeric,unallocated_amount numeric)
 language sql immutable security invoker set search_path='' as $$
 with checked as(
  select p_amount is not null and p_applied is not null and p_unallocated is not null
   and p_amount not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
   and p_applied not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
   and p_unallocated not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
   and abs(p_amount)=abs(p_applied)+abs(p_unallocated) as reconciled,
   case when p_amount<0 then 1 when p_amount>0 then -1 else 0 end as direction
 )
 select case when reconciled then direction*abs(p_applied) end,
  case when reconciled then direction*abs(p_unallocated) end from checked;
$$;
revoke all on function ar_private.financial_payment_allocation(numeric,numeric,numeric) from public,anon,authenticated,service_role;

do $migration$
declare definition text;needle text;replacement text;signature text;change record;
begin
 signature:='ar_private.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer)';
 definition:=pg_get_functiondef(signature::regprocedure);
 -- Replace allocation-only expressions. The report's original signed posting,
 -- credit/debit totals, coverage, filters, transfers and raw row JSON stay intact.
 for change in select * from(values
  ($needle$select p.* from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id$needle$,
   $replacement$select p.*,allocation.applied_amount as directed_applied_amount,allocation.unallocated_amount as directed_unallocated_amount
   from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id
   cross join lateral ar_private.financial_payment_allocation(p.amount,p.applied_amount,p.unallocated_amount) allocation$replacement$),
  ($needle$'currentlyApplied',case when complete and count(*) filter(where source_status<>'observed' or applied_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(-sum(applied_amount),0)) end$needle$,
   $replacement$'currentlyApplied',case when complete and count(*) filter(where source_status<>'observed' or directed_applied_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(sum(directed_applied_amount),0)) end$replacement$),
  ($needle$'currentlyUnallocated',case when complete and count(*) filter(where source_status<>'observed' or unallocated_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(-sum(unallocated_amount),0)) end$needle$,
   $replacement$'currentlyUnallocated',case when complete and count(*) filter(where source_status<>'observed' or directed_unallocated_amount is null or source_date is null)=0 then ar_private.financial_money(coalesce(sum(directed_unallocated_amount),0)) end$replacement$)
 )v(old_text,new_text) loop
  if (length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text)<>1 then
   raise exception 'review current financial payment summary definition';
  end if;
  definition:=replace(definition,change.old_text,change.new_text);
 end loop;
 execute definition;

 -- Application links already carry the normalized credit/debit direction. Require
 -- the reconciled expected allocation and leave every identity/freshness/proof
 -- predicate, including the preceding invoice-type correction, unchanged.
 signature:='public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)';
 definition:=pg_get_functiondef(signature::regprocedure);
 needle:=$needle$m.amount=-p.applied_amount$needle$;
 replacement:=$replacement$m.amount=(select allocation.applied_amount from ar_private.financial_payment_allocation(p.amount,p.applied_amount,p.unallocated_amount) allocation)$replacement$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
  raise exception 'review current dashboard payment allocation definition';
 end if;
 definition:=replace(definition,needle,replacement);
 execute definition;
end $migration$;
