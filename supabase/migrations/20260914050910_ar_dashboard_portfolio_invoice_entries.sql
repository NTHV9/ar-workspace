-- New Invoices uses Portfolio's saved invoice table filtered only by OPERA
-- Bill Date and the selected Hotel/Account/Type. Stored zero/closed invoices
-- remain in their Bill Date cohort. Financial-history publications are unrelated.
create function public.ar_dashboard_invoice_entries(p_actor uuid,p_from date,p_to date,p_hotel text default null,p_account text default null,p_type text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 result jsonb;summary jsonb;source_complete boolean;complete boolean;last_success timestamptz;last_checked timestamptz;
 last_status text;last_error text;known numeric;unknowns bigint;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_from<date '0001-01-01' or p_to>date '9999-12-31' or p_from>p_to or p_to-p_from>3660
  or p_to>(current_timestamp at time zone 'Asia/Bangkok')::date
  or p_hotel is not null and p_hotel not in('KAT','TSK')
  or p_account is not null and (p_hotel is null or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200
  then return jsonb_build_object('error','dashboard_invalid');end if;

 -- A failed/in-progress attempt does not erase an earlier verified current
 -- publication. Missing full-hotel source coverage cannot become a known zero.
 select bool_and(r.last_success_at is not null),case when bool_and(r.last_success_at is not null) then min(r.last_success_at) end
 into source_complete,last_success
 from (values('KAT'::text),('TSK'::text)) h(hotel) left join public.ar_refresh_state r on r.hotel=h.hotel
 where p_hotel is null or h.hotel=p_hotel;
 select case when r.status in('queued','running','succeeded','failed') then r.status end,r.error_code into last_status,last_error
 from public.ar_refresh_state r where p_hotel is null or r.hotel=p_hotel order by r.last_attempt_at desc nulls last,r.hotel limit 1;
 select source_complete and coalesce(bool_and(a.verification_state='verified' or a.verification_state='cleared' and a.open=0),true),min(a.synced_at)
 into source_complete,last_checked from public.ar_accounts a
 where (p_hotel is null or a.hotel=p_hotel) and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type);

 with filtered as materialized (
  select i.*,a.name as account_name,a.type as account_type,a.account_no,
   (i.verification_state='verified' or i.verification_state='cleared' and i.open=0)
    and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0) as observed,
   i.collection_role in('standalone','parent') and i.parent_invoice_id is null as root
  from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
  where i.transaction_date between p_from and p_to
   and (p_hotel is null or i.hotel=p_hotel) and (p_account is null or i.account_id=p_account) and (p_type is null or a.type=p_type)
 ), classified as materialized (
  select *,observed and root and original not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
   and open not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) as measured
  from filtered
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
   'hotel',i.hotel,'accountId',i.account_id,'transactionId',i.id,'kind','invoice','transactionDate',i.transaction_date,
   'accountName',i.account_name,'accountType',i.account_type,'accountNo',i.account_no,'invoiceNo',i.invoice_no,'folioNo',i.folio_no,
   'originalAmount',ar_private.financial_money(i.original),'openAmount',ar_private.financial_money(i.open),
   'currentAmount',ar_private.financial_money(i.current_amount),'cumulativePayments',ar_private.financial_money(i.applied_amount),
   'currency','THB','invoiceType',null,'postingDate',null,'revenueDate',null,'transferDate',null,'transferredIn',null,'transferredOut',null,'closeDate',null,
   'compressed',i.compressed,'parentInvoiceNo',i.parent_invoice_no,'collectionRole',i.collection_role,
   'entryClassification',case when i.root or i.collection_role='child' then 'invoice' else 'unclassified' end,
   'sourceStatus',case when i.observed then 'observed' else 'not_observed' end,'lastObservedAt',i.synced_at,'lastCheckedAt',i.synced_at
  ) order by i.transaction_date desc,i.hotel,i.account_id,i.id)
  from (select * from classified order by transaction_date desc,hotel,account_id,id offset p_offset limit p_limit) i),'[]'::jsonb),
  'total',count(*)),coalesce(sum(original) filter(where measured),0),count(*) filter(where collection_role<>'child' and not measured),
  jsonb_build_object('rows',count(*),'measuredRows',count(*) filter(where measured),'invoiceCount',count(*) filter(where measured),
   'paymentCount',0,'notObserved',count(*) filter(where collection_role<>'child' and not observed),'unknownSourceDates',0,
   'compressedChildren',count(*) filter(where collection_role='child'),'openingBalances',0,'credits',count(*) filter(where measured and open<0))
 into result,known,unknowns,summary from classified;
 complete:=source_complete and unknowns=0;
 summary:=summary||jsonb_build_object('knownAmount',ar_private.financial_money(known),'amount',case when complete then ar_private.financial_money(known) end,
  'unknownAmounts',unknowns,'amountBasis','original_invoice_amount','dateBasis','invoice_transaction_date',
  'receiptClassification','unknown','applicationDatesVerified',false,'coverageComplete',complete);
 return result||jsonb_build_object('view','invoice_entries','source','portfolio','summary',summary,'coverage',jsonb_build_object(
  'source','portfolio','complete',complete,'from',p_from,'to',p_to,'lastSuccessAt',last_success,'lastCheckedAt',last_checked,
  'lastAttemptStatus',last_status,'lastError',last_error));
end$$;
revoke all on function public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer) to service_role;

-- Keep the other five overview readers and their error isolation unchanged.
create or replace function public.ar_dashboard_hotel_overview(p_actor uuid,p_from date,p_to date,p_type text default null)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 h text;segment text;part jsonb;scope jsonb;total jsonb;hotels jsonb:='[]'::jsonb;code text;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_from<date '0001-01-01' or p_to>date '9999-12-31' or p_from>p_to or p_to-p_from>3660
  or p_to>(now() at time zone 'Asia/Bangkok')::date
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  then return jsonb_build_object('error','dashboard_invalid');end if;
 foreach h in array array[null,'KAT','TSK'] loop
  scope:='{}'::jsonb;
  foreach segment in array array['balances','activity','external','entries','payments','paid'] loop
   part:=null;
   begin
    case segment
     when 'balances' then part:=public.ar_dashboard_balances(p_actor,p_to,h,null,p_type,null,null,0,1);
     when 'activity' then part:=public.ar_reports_read(p_actor,'activity',h,null,p_type,p_from,p_to,0,1,null,null);
     when 'external' then part:=public.ar_external_billing_read(p_actor,h,null,p_from,p_to,0,1,p_type);
     when 'entries' then part:=public.ar_dashboard_invoice_entries(p_actor,p_from,p_to,h,null,p_type,0,1);
     when 'payments' then part:=public.ar_financial_report(p_actor,'payments',h,null,p_type,p_from,p_to,0,1);
     when 'paid' then part:=public.ar_dashboard_payment_invoices(p_actor,p_from,p_to,h,null,p_type,0,1);
    end case;
   exception when others then
    if sqlstate in('42501','28000','28P01') or sqlerrm~'(^|_)(forbidden|unauthorized)(_|$)' then return jsonb_build_object('error','dashboard_forbidden');end if;
    if sqlstate='22023' or sqlerrm~'(^|_)invalid(_|$)' then return jsonb_build_object('error','dashboard_invalid');end if;
    part:=null;
   end;
   code:=part->>'error';
   if code~'(^|_)(forbidden|unauthorized)(_|$)' then return jsonb_build_object('error','dashboard_forbidden');end if;
   if code~'(^|_)invalid(_|$)' then return jsonb_build_object('error','dashboard_invalid');end if;
   if jsonb_typeof(part) is distinct from 'object' or part?'error' then part:=null;
   elsif segment in('entries','payments') then
    if jsonb_typeof(part->'summary') is distinct from 'object' or jsonb_typeof(part->'coverage') is distinct from 'object' then part:=null;
    else part:=jsonb_build_object('summary',part->'summary','coverage',part->'coverage');end if;
   elsif segment in('activity','external') then
    if jsonb_typeof(part->'summary') is distinct from 'object' or jsonb_typeof(part->'total') is distinct from 'number' then part:=null;
    else part:=jsonb_build_object('rows','[]'::jsonb,'total',part->'total','summary',part->'summary');end if;
   else part:=jsonb_set(part,'{rows}','[]'::jsonb);
   end if;
   scope:=scope||jsonb_build_object(segment,part);
  end loop;
  if h is null then total:=scope;else hotels:=hotels||jsonb_build_array(scope||jsonb_build_object('hotel',h));end if;
 end loop;
 return jsonb_build_object('from',p_from,'to',p_to,'total',total,'hotels',hotels);
end$$;
revoke all on function public.ar_dashboard_hotel_overview(uuid,date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_hotel_overview(uuid,date,date,text) to service_role;
