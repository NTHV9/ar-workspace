-- One stable invocation shares a database snapshot across Total/KAT/TSK.
-- Existing readers own money, cohort membership, source coverage and actor checks.
-- No rows are stored or provider services called by this summary composition.
create function public.ar_dashboard_hotel_overview(p_actor uuid,p_from date,p_to date,p_type text default null)
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
   -- A failed reader cannot erase unrelated sources. Authorization and caller
   -- validation failures remain top-level failures, never source-unavailable data.
   begin
    case segment
     when 'balances' then part:=public.ar_dashboard_balances(p_actor,p_to,h,null,p_type,null,null,0,1);
     when 'activity' then part:=public.ar_reports_read(p_actor,'activity',h,null,p_type,p_from,p_to,0,1,null,null);
     when 'external' then part:=public.ar_external_billing_read(p_actor,h,null,p_from,p_to,0,1,p_type);
     when 'entries' then part:=public.ar_financial_report(p_actor,'invoice_entries',h,null,p_type,p_from,p_to,0,1);
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
