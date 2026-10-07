-- A nonblank older external Sheet date must not silently replace a confirmed
-- Sent writeback. Reviewed choices and later legitimate Sheet facts still work.
create index tracker_history_confirmed_reminder_lookup
 on ar_private.tracker_history(hotel,account_id,invoice_id,field,actual_date desc)
 include(region,row_key,delivery_id)
 where source='confirmed_sent_writeback' and actual_date is not null;

create function ar_private.tracker_confirmed_reminder_reversion(p_owner uuid,p_region text,p_key text,p_hotel text,p_account text,p_invoice text,p_field text,p_sheet_day date)
returns boolean language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 if p_field not in('U','V','W') or p_sheet_day is null then return false;end if;
 return exists(
  select 1 from ar_private.tracker_history h
  join public.ar_sent_events linked on linked.delivery_id=h.delivery_id and linked.owner=p_owner
   and linked.hotel=p_hotel and linked.account_id=p_account and p_invoice=any(linked.invoice_ids)
   and linked.purpose='collection' and linked.stage=case p_field when 'U' then 'Follow 1' when 'V' then 'Follow 2' else 'Follow 3' end
  join ar_private.mail_deliveries receipt on receipt.id=linked.delivery_id and receipt.owner=linked.owner and receipt.state='sent' and receipt.mode in('send','draft')
  where h.region=p_region and h.row_key=p_key and h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice and h.field=p_field
   and h.source='confirmed_sent_writeback' and h.actual_date is not null and h.actual_date>p_sheet_day
   and exists(
    -- A paged older delivery can publish the latest same-stage Sent day from a
    -- different delivery. Corroborate that day, not equality to linked.sent_at.
    select 1 from public.ar_sent_events actual
    join ar_private.mail_deliveries actual_receipt on actual_receipt.id=actual.delivery_id and actual_receipt.owner=actual.owner and actual_receipt.state='sent' and actual_receipt.mode in('send','draft')
    where actual.owner=p_owner and actual.hotel=p_hotel and actual.account_id=p_account and p_invoice=any(actual.invoice_ids)
     and actual.purpose='collection' and actual.stage=linked.stage
     and actual.sent_at>=(h.actual_date::timestamp at time zone 'Asia/Bangkok')
     and actual.sent_at<((h.actual_date+1)::timestamp at time zone 'Asia/Bangkok')
   )
 );
end $$;
revoke all on function ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date) from public,anon,authenticated,service_role;

do $$declare definition text;needle text;begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),E'\r','');
 needle:=$needle$   elsif (base is null and wv='null' or base=wv) and sv<>'null' then$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_confirmed_reminder_import_guard_drift';end if;
 definition:=replace(definition,needle,$replacement$   elsif (case when f in('U','V','W') and sv<>'null' then ar_private.tracker_confirmed_reminder_reversion(o,p_region,r->>'rowKey',w.hotel,a,i,f,(sv#>>'{}')::date) else false end) then needs_review:=true;
   elsif (base is null and wv='null' or base=wv) and sv<>'null' then$replacement$);
 execute definition;
end $$;
