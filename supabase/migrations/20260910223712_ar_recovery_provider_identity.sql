create or replace function public.ar_recovery_sent_match(p_actor uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;result jsonb:='[]';d ar_private.mail_deliveries;matched_delivery_id uuid;matches integer;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','operations_forbidden');end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>50 then return jsonb_build_object('error','operations_invalid');end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'deliveryId' is not null and r->>'deliveryId'!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(r->>'gmailId','')!~'^[A-Za-z0-9_-]{1,200}$' then return jsonb_build_object('error','operations_invalid');end if;
  matched_delivery_id:=(r->>'deliveryId')::uuid;
  if matched_delivery_id is not null then
   select * into d from ar_private.mail_deliveries where mail_deliveries.id=matched_delivery_id and owner=p_actor;matches:=case when found then 1 else 0 end;
  else
   select count(*) into matches from ar_private.mail_deliveries where owner=p_actor and (gmail_id=r->>'gmailId' or provider_receipt_id=r->>'gmailId');
   if matches=0 then continue;end if;
   if matches>1 then result:=result||jsonb_build_array(jsonb_build_object('deliveryId',null,'gmailId',r->>'gmailId','sentAt',r->>'sentAt','state','marker_conflict'));continue;end if;
   select * into d from ar_private.mail_deliveries where owner=p_actor and (gmail_id=r->>'gmailId' or provider_receipt_id=r->>'gmailId');matched_delivery_id:=d.id;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('deliveryId',matched_delivery_id,'gmailId',r->>'gmailId','sentAt',r->>'sentAt','state',case when matches=0 then 'missing_receipt' when d.state='sent' and d.gmail_id=r->>'gmailId' then 'recorded' else 'needs_reconciliation' end,'mode',d.mode,'matchedBy',case when r->>'deliveryId' is null then 'saved_provider_id' else 'ar_marker' end));
 end loop;return result;
end$$;
revoke all on function public.ar_recovery_sent_match(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_recovery_sent_match(uuid,jsonb) to service_role;
