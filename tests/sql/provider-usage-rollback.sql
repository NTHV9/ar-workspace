begin;
set local timezone='UTC';
do $$
-- Fixed post-midnight clock deliberately places earlier observations on the prior date.
declare fixture_clock timestamptz:='2026-10-26T00:05:00Z';actor uuid;staff uuid:=gen_random_uuid();command uuid:=gen_random_uuid();r jsonb;s jsonb;metric jsonb;old_stamp text;v integer;cycle_evidence jsonb;cycle_failures text[]:=array[]::text[];
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',actor)::text,true);
 r:=public.ar_provider_usage_read(actor);
 if jsonb_array_length(r->'providers') is distinct from 2 or r#>>'{providers,0,warningPercent}' is distinct from '80' or r#>>'{providers,1,warningPercent}' is distinct from '50' or r#>'{providers,0,metrics}' is distinct from '[]'::jsonb then raise exception 'unavailable defaults %',r;end if;
 insert into ar_private.access_members(email,administrator,regions) values('provider-staff@synthetic.invalid',false,array['phuket','khao-lak']);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(staff,'provider-staff@synthetic.invalid',fixture_clock,false);
 if public.ar_provider_usage_read(staff)->>'error' is distinct from 'provider_forbidden' then raise exception 'staff read';end if;
 if public.ar_provider_alert_save(staff,'cloudflare',80,0,command)->>'error' is distinct from 'provider_forbidden' then raise exception 'staff write';end if;
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',staff)::text,true);
 if public.ar_provider_usage_read(actor)->>'error' is distinct from 'provider_forbidden' then raise exception 'owner remapping bypass';end if;
 if public.ar_provider_alert_save(actor,'cloudflare',80,0,command)->>'error' is distinct from 'provider_forbidden' then raise exception 'owner save bypass';end if;
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',actor)::text,true);
 r:=public.ar_provider_alert_save(actor,'cloudflare',1,0,command);
 if r->>'revision' is distinct from '1' or r->>'warningPercent' is distinct from '1' then raise exception 'save minimum %',r;end if;
 if public.ar_provider_alert_save(actor,'cloudflare',1,0,command) is distinct from r then raise exception 'idempotent replay';end if;
 if public.ar_provider_alert_save(actor,'cloudflare',100,0,command)->>'error' is distinct from 'provider_command_conflict' then raise exception 'changed command';end if;
 if public.ar_provider_alert_save(actor,'supabase',1,0,command)->>'error' is distinct from 'provider_command_conflict' then raise exception 'changed provider command';end if;
 s:=public.ar_provider_alert_save(actor,'cloudflare',100,0,gen_random_uuid());
 if s->>'error' is distinct from 'provider_revision_conflict' or s#>>'{latest,revision}' is distinct from '1' then raise exception 'revision conflict %',s;end if;
 r:=public.ar_provider_alert_save(actor,'cloudflare',100,1,gen_random_uuid());if r->>'revision' is distinct from '2' then raise exception 'maximum';end if;
 foreach v in array array[0,101,-1] loop
 if public.ar_provider_alert_save(actor,'cloudflare',v,2,gen_random_uuid())->>'error' is distinct from 'provider_invalid' then raise exception 'invalid threshold';end if;end loop;
 old_stamp:=to_jsonb(fixture_clock-interval '1 hour')#>>'{}';
 metric:=jsonb_build_object('id','synthetic-requests','label','Synthetic requests','product','Workers','unit','count','used',244,'included',100,'scope','account','scopeLabel','Account','periodStart',fixture_clock-interval '1 day','periodEnd',fixture_clock-interval '30 minutes','periodLabel','Synthetic October dates','periodBasis','billing-cycle','observedAt',old_stamp,'verifiedAt',fixture_clock,'staleAfter',fixture_clock+interval '1 day','source','provider_snapshot','sourceLabel','Last verified','precision','rounded','state','available');
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric));
 r:=public.ar_provider_snapshot_write(actor,'cloudflare',0,s,null);if r->>'revision' is distinct from '1' then raise exception 'snapshot %',r;end if;
 r:=public.ar_provider_usage_read(actor);if r#>>'{providers,0,metrics,0,included}' is distinct from '100' or r#>>'{providers,0,warningPercent}' is distinct from '100' then raise exception 'alert changed denominator';end if;
 if public.ar_provider_snapshot_write(actor,'cloudflare',0,s,null)->>'error' is distinct from 'provider_revision_conflict' then raise exception 'snapshot revision';end if;
 s:=jsonb_set(s,'{metrics,0,observedAt}',to_jsonb(fixture_clock-interval '2 hours'));
 if public.ar_provider_snapshot_write(actor,'cloudflare',1,s,null)->>'error' is distinct from 'provider_observation_conflict' then raise exception 'older observation';end if;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||'{"state":"unavailable","used":null}'::jsonb));
 if public.ar_provider_snapshot_write(actor,'cloudflare',1,s,null)->>'error' is distinct from 'provider_snapshot_invalid' then raise exception 'unavailable replacement';end if;
 if public.ar_provider_usage_read(actor)#>>'{providers,0,metrics,0,observedAt}' is distinct from old_stamp then raise exception 'failed source changed as-of';end if;
 -- Relabeling identical old evidence must fail for exact and source-date-only cycles.
 cycle_evidence:=jsonb_build_object('previousPeriodLabel','Synthetic October dates','periodLabel','Synthetic November dates','previousEndDate',to_char(fixture_clock-interval '30 minutes','YYYY-MM-DD'),'startDate',to_char(fixture_clock-interval '15 minutes','YYYY-MM-DD'));
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||jsonb_build_object('periodLabel','Synthetic November dates','periodStart',null,'periodEnd',null)));
 if public.ar_provider_snapshot_write(actor,'cloudflare',1,s,null)->>'error' is distinct from 'provider_cycle_conflict' then raise exception 'unverified cycle';end if;
 begin
  r:=public.ar_provider_snapshot_write(actor,'cloudflare',1,s,cycle_evidence);
  if r->>'error' is distinct from 'provider_cycle_conflict' then cycle_failures:=array_append(cycle_failures,'date-only copied observation accepted');end if;
  raise exception sqlstate 'Z0001';
 exception when sqlstate 'Z0001' then null;end;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||jsonb_build_object('periodLabel','Synthetic November dates','periodStart',fixture_clock+interval '30 minutes','periodEnd',fixture_clock+interval '1 day','verifiedAt',fixture_clock,'staleAfter',fixture_clock+interval '2 days')));
 begin
  r:=public.ar_provider_snapshot_write(actor,'cloudflare',1,s,null);
  if r->>'error' is distinct from 'provider_cycle_conflict' then cycle_failures:=array_append(cycle_failures,'exact copied observation accepted');end if;
  raise exception sqlstate 'Z0001';
 exception when sqlstate 'Z0001' then null;end;
 -- A newer timestamp before the new cycle still is not new-period evidence.
 s:=jsonb_set(s,'{metrics,0,observedAt}',to_jsonb(fixture_clock-interval '15 minutes'));
 begin
  r:=public.ar_provider_snapshot_write(actor,'cloudflare',1,s,null);
  if r->>'error' is distinct from 'provider_cycle_conflict' then cycle_failures:=array_append(cycle_failures,'exact before-start observation accepted');end if;
  raise exception sqlstate 'Z0001';
 exception when sqlstate 'Z0001' then null;end;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||jsonb_build_object('periodLabel','Synthetic November dates','periodStart',null,'periodEnd',null,'observedAt',fixture_clock-interval '15 minutes')));
 begin
  r:=public.ar_provider_snapshot_write(actor,'cloudflare',1,s,cycle_evidence||jsonb_build_object('startDate',to_char(fixture_clock+interval '1 day','YYYY-MM-DD')));
  if r->>'error' is distinct from 'provider_cycle_conflict' then cycle_failures:=array_append(cycle_failures,'date-only before-start observation accepted');end if;
  raise exception sqlstate 'Z0001';
 exception when sqlstate 'Z0001' then null;end;
 if cardinality(cycle_failures)>0 then raise exception 'cycle carry-forward regression: %',cycle_failures;end if;
 if public.ar_provider_usage_read(actor)#>>'{providers,0,metrics,0,observedAt}' is distinct from old_stamp or public.ar_provider_usage_read(actor)#>>'{providers,0,metrics,0,periodLabel}' is distinct from 'Synthetic October dates' or (select max(revision) from ar_private.provider_snapshots where provider='cloudflare') is distinct from 1::bigint then raise exception 'rejected cycle mutated previous snapshot';end if;
 -- Same amount is valid when a fresh source observation actually belongs to the new cycle.
 r:=public.ar_provider_snapshot_write(actor,'cloudflare',1,s,cycle_evidence);
 if r->>'revision' is distinct from '2' then raise exception 'date-only fresh next cycle %',r;end if;
 if public.ar_provider_usage_read(actor)#>'{providers,0,metrics,0,periodStart}' is distinct from 'null'::jsonb or public.ar_provider_usage_read(actor)#>'{providers,0,metrics,0,periodEnd}' is distinct from 'null'::jsonb then raise exception 'invented date-only timezone bounds';end if;
 -- Exact start-inclusive observation is valid; amount remains unchanged.
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||jsonb_build_object('periodLabel','Synthetic December dates','periodStart',fixture_clock-interval '5 minutes','periodEnd',fixture_clock+interval '1 day','observedAt',fixture_clock-interval '5 minutes')));
 r:=public.ar_provider_snapshot_write(actor,'cloudflare',2,s,jsonb_build_object('previousPeriodLabel','Synthetic November dates','periodLabel','Synthetic December dates','previousEndDate',to_char(fixture_clock-interval '5 minutes','YYYY-MM-DD'),'startDate',to_char(fixture_clock-interval '5 minutes','YYYY-MM-DD')));
 if r->>'revision' is distinct from '3' then raise exception 'exact fresh next cycle %',r;end if;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||'{"token":"synthetic-secret"}'::jsonb));
 if public.ar_provider_snapshot_write(actor,'cloudflare',3,s,null)->>'error' is distinct from 'provider_snapshot_invalid' then raise exception 'raw credential key';end if;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||'{"unit":"GiB"}'::jsonb));
 if public.ar_provider_snapshot_write(actor,'cloudflare',3,s,null)->>'error' is distinct from 'provider_snapshot_invalid' then raise exception 'unit';end if;
 s:=jsonb_build_object('planLabel','Synthetic plan','metrics',jsonb_build_array(metric||'{"unit":null}'::jsonb));
 if public.ar_provider_snapshot_write(actor,'supabase',0,s,null)->>'error' is distinct from 'provider_snapshot_invalid' then raise exception 'null unit';end if;
 s:=jsonb_build_object('planLabel',null,'metrics',jsonb_build_array(metric||'{"id":"synthetic-disk","scope":"organization","scopeLabel":"Organization pooled","product":"Database disk","unit":"GB-month","used":null,"observedAt":null}'::jsonb));
 r:=public.ar_provider_snapshot_write(actor,'supabase',0,s,null);if r->>'revision' is distinct from '1' then raise exception 'unknown initial organization entitlement %',r;end if;
 if public.ar_provider_snapshot_write(actor,'supabase',1,s,'{"token":"synthetic-secret"}'::jsonb)->>'error' is distinct from 'provider_cycle_conflict' then raise exception 'raw evidence';end if;
 if public.ar_provider_alert_save(actor,'cloudflare',1,0,command)->>'revision' is distinct from '1' then raise exception 'old success receipt mutated after later save';end if;
 if public.ar_provider_snapshot_write(staff,'supabase',0,s,null)->>'error' is distinct from 'provider_forbidden' then raise exception 'snapshot staff';end if;
 for r in select to_jsonb(x) from (values('public.ar_provider_usage_read(uuid)'),('public.ar_provider_alert_save(uuid,text,integer,bigint,uuid)'),('public.ar_provider_snapshot_write(uuid,text,bigint,jsonb,jsonb)')) x(signature) loop
  if has_function_privilege('anon',r->>'signature','EXECUTE') or has_function_privilege('authenticated',r->>'signature','EXECUTE') or not has_function_privilege('service_role',r->>'signature','EXECUTE') then raise exception 'RPC grants %',r;end if;
 end loop;
 if has_table_privilege('authenticated','ar_private.provider_snapshots','SELECT') or has_table_privilege('service_role','ar_private.provider_snapshots','INSERT') or exists(select from pg_class where oid in('ar_private.provider_snapshots'::regclass,'ar_private.provider_alert_settings'::regclass,'ar_private.provider_alert_commands'::regclass) and not relrowsecurity) then raise exception 'table private';end if;
end$$;
rollback;
