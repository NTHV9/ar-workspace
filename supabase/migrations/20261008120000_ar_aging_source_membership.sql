-- Aging-only read projection. Never update invoice age, dates, or persisted ledger.
-- Qualified offsets describe source-reconciled membership, not an inferred date convention.
create function ar_private.aging_source_membership(p_buckets jsonb,p_roots jsonb,p_account_open numeric,p_publication_valid boolean)
returns jsonb language plpgsql immutable set search_path='' as $$
declare unavailable jsonb:='{"contract":"opera_reconciled_v1","state":"unavailable","offsetDays":null,"buckets":{}}';
 b jsonb;i jsonb;delta integer;age_value numeric;key_value text;mapping jsonb;chosen jsonb;chosen_delta integer;
 debit_value numeric;invoice_net numeric;native_net numeric;native_debit numeric;native_credit numeric;
 invoice_credit boolean;account_credit boolean;candidate_valid boolean;matches integer;ids integer;
begin
 if p_publication_valid is distinct from true or p_account_open is null or not ar_private.aging_schema_valid(p_buckets)
  or jsonb_typeof(p_roots) is distinct from 'array' then return unavailable;end if;
 -- Compare exact cents and validate the provider's signed debit/credit identity.
 if p_account_open<>round(p_account_open,2) then return unavailable;end if;
 for b in select value from jsonb_array_elements(p_buckets) loop
  if (b->>'credit')::numeric<0
   or (b->>'amount')::numeric<>(b->>'debit')::numeric-(b->>'credit')::numeric
   or (b->>'amount')::numeric<>round((b->>'amount')::numeric,2)
   or (b->>'debit')::numeric<>round((b->>'debit')::numeric,2)
   or (b->>'credit')::numeric<>round((b->>'credit')::numeric,2) then return unavailable;end if;
 end loop;
 for i in select value from jsonb_array_elements(p_roots) loop
  if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'id') is distinct from 'string' or nullif(btrim(i->>'id'),'') is null
   or jsonb_typeof(i->'open') is distinct from 'number' or jsonb_typeof(i->'age') is distinct from 'number' then return unavailable;end if;
  age_value:=(i->>'age')::numeric;
  if age_value<0 or age_value<>trunc(age_value) or age_value>9007199254740991
   or (i->>'open')::numeric=0 or (i->>'open')::numeric<>round((i->>'open')::numeric,2) then return unavailable;end if;
 end loop;
 select count(distinct x.value->>'id'),coalesce(sum((x.value->>'open')::numeric),0),coalesce(bool_or((x.value->>'open')::numeric<0),false)
 into ids,invoice_net,invoice_credit from jsonb_array_elements(p_roots)x(value);
 if ids<>jsonb_array_length(p_roots) then return unavailable;end if;
 select sum((x.value->>'amount')::numeric),sum((x.value->>'debit')::numeric),sum((x.value->>'credit')::numeric)
 into native_net,native_debit,native_credit from jsonb_array_elements(p_buckets)x(value);
 if native_net<>p_account_open then return unavailable;end if;
 -- OPERA debit is the signed invoice ledger sum. OPERA credit is the separate
 -- account-credit component, not the sum of negative invoice identities.
 -- Preserve the explicit account-credit case only without invoice-credit overlap.
 account_credit:=native_credit>0;
 if native_debit<>invoice_net or native_net<>invoice_net-native_credit or account_credit and invoice_credit then return unavailable;end if;
 for delta in 0..1 loop
  mapping:='{}';candidate_valid:=true;
  for i in select value from jsonb_array_elements(p_roots) loop
   age_value:=greatest((i->>'age')::numeric-delta,0);
   select count(*),min(jsonb_build_array(x.value->'label',x.value->'start',x.value->'end',x.value->'sequence')::text)
   into matches,key_value from jsonb_array_elements(p_buckets)x(value) where age_value>=(x.value->>'start')::numeric and (x.value->'end'='null'::jsonb or age_value<=(x.value->>'end')::numeric);
   if matches<>1 then candidate_valid:=false;exit;end if;
   mapping:=mapping||jsonb_build_object(i->>'id',key_value);
  end loop;
  if candidate_valid then
   for b in select value from jsonb_array_elements(p_buckets) loop
    key_value:=jsonb_build_array(b->'label',b->'start',b->'end',b->'sequence')::text;
    select coalesce(sum((x.value->>'open')::numeric),0)
    into debit_value from jsonb_array_elements(p_roots)x(value) where mapping->> (x.value->>'id')=key_value;
    if debit_value<>(b->>'debit')::numeric or debit_value-(b->>'credit')::numeric<>(b->>'amount')::numeric then candidate_valid:=false;exit;end if;
   end loop;
  end if;
  if candidate_valid then
   if chosen is not null and chosen<>mapping then return unavailable;end if;
   if chosen is null then chosen:=mapping;chosen_delta:=-delta;end if;
  end if;
 end loop;
 if chosen is null then return unavailable;end if;
 return jsonb_build_object('contract','opera_reconciled_v1','state','resolved','offsetDays',chosen_delta,'buckets',chosen);
exception when others then return unavailable;
end$$;
revoke all on function ar_private.aging_source_membership(jsonb,jsonb,numeric,boolean) from public,anon,authenticated,service_role;

-- Exact account publication for the protected amount-click inventory. Do not
-- broaden the existing generic invoice reader to account tables.
create function public.ar_access_account_publication(p_actor uuid,p_hotel text,p_account text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;result jsonb;
begin
 m:=ar_private.access_member(p_actor);
 if m.email is null or p_hotel is null or not p_hotel=any(ar_private.access_hotels(m.regions)) then raise exception 'access_forbidden';end if;
 if p_account is null or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]' then raise exception 'access_invalid';end if;
 select coalesce(jsonb_agg(jsonb_build_object('hotel',a.hotel,'id',a.id,'synced_at',a.synced_at)),'[]'::jsonb)
 into result from public.ar_accounts a where a.hotel=p_hotel and a.id=p_account;
 return result;
end$$;
revoke all on function public.ar_access_account_publication(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_access_account_publication(uuid,text,text) to service_role;

-- Patch the current regional definition, retaining all existing authorization,
-- workflow, child evidence, filtering and pagination logic. Assert every seam.
do $patch$
declare definition text;r record;
begin
 definition:=replace(pg_get_functiondef('public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)'::regprocedure),chr(13),'');
 for r in select * from(values
 ($old$source as materialized(select i.*$old$,$new$raw_source as materialized(select i.*$new$),
 ($old$bk.matches,bk.bucket from public.ar_invoices$old$,$new$null::bigint as matches,null::jsonb as bucket from public.ar_invoices$new$),
 ($old$ left join lateral(select count(*) as matches,jsonb_agg(jsonb_build_array(b->'label',b->'start',b->'end',b->'sequence'))->0 as bucket
 from jsonb_array_elements(case when a.schema_valid then a."agingBuckets" else '[]'::jsonb end)b
 where i.age>=(b->>'start')::numeric and (b->'end'='null'::jsonb or i.age<=(b->>'end')::numeric))bk on true),$old$,
 $new$),
 membership as materialized(select a.hotel,a.id,ar_private.aging_source_membership(a."agingBuckets",
  coalesce(jsonb_agg(jsonb_build_object('id',s.id,'age',s.age,'open',s.open)) filter(where s.root and s.open<>0),'[]'::jsonb),a.open,
  a.synced_at is not null and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0)
  and exists(select 1 from public.ar_refresh_state rs where rs.hotel=a.hotel and rs.last_success_at is not null)
  and not exists(select 1 from raw_source bad where bad.hotel=a.hotel and bad.account_id=a.id
   and not bad.child and not(bad.verification_state in('verified','cleared') and bad.open=0)
   and (not bad.root or not bad.account_verified or bad.synced_at is distinct from a.synced_at))) as resolution
  from accounts a left join raw_source s on s.hotel=a.hotel and s.account_id=a.id group by a.hotel,a.id,a."agingBuckets",a.open,a.synced_at,a.verification_state),
 source as materialized(select s.*,case when m.resolution->>'state'='resolved' and m.resolution->'buckets' ? s.id then 1 else 0 end as resolved_matches,
  (m.resolution->'buckets'->>s.id)::jsonb as resolved_bucket from raw_source s join membership m on m.hotel=s.hotel and m.id=s.account_id),$new$),
 ($old$s.matches$old$,$new$s.resolved_matches$new$),
 ($old$s.bucket$old$,$new$s.resolved_bucket$new$),
 ($old$as unassigned,$old$,$new$+case when max(m.resolution->>'state')='resolved' then 0 else 1 end as unassigned,$new$),
 ($old$from accounts a left join source s on s.hotel=a.hotel and s.account_id=a.id group by a.hotel,a.id),$old$,
  $new$from accounts a join membership m on m.hotel=a.hotel and m.id=a.id left join source s on s.hotel=a.hotel and s.account_id=a.id group by a.hotel,a.id),$new$),
 ($old$packed as(select a.hotel,a.id,a.type,a.synced_at,q.unverified,$old$,$new$packed as(select a.hotel,a.id,a.type,a.synced_at,q.unverified,m.resolution - 'buckets' as membership,$new$),
 ($old$from accounts a join quality q on q.hotel=a.hotel and q.id=a.id join counts c$old$,$new$from accounts a join membership m on m.hotel=a.hotel and m.id=a.id join quality q on q.hotel=a.hotel and q.id=a.id join counts c$new$),
 ($old$group by a.hotel,a.id,a.type,a.synced_at,q.unverified,a.verification_state,a.open)$old$,$new$group by a.hotel,a.id,a.type,a.synced_at,q.unverified,a.verification_state,a.open,m.resolution)$new$),
 ($old$'unverified',unverified,'buckets',buckets$old$,$new$'unverified',unverified,'membership',membership,'buckets',buckets$new$),
 ($old$'open',ar_private.financial_money(s.open),'age',s.age,$old$,$new$'open',ar_private.financial_money(s.open),'age',s.age,'bucketKey',s.resolved_bucket::text,$new$)
 )edits(needle,replacement) loop
  if strpos(definition,r.needle)=0 then raise exception 'aging_membership_patch_drift:%',r.needle;end if;
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>(case r.needle when 's.matches' then 4 when 's.bucket' then 2 else 1 end) then raise exception 'aging_membership_patch_ambiguous:%',r.needle;end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

