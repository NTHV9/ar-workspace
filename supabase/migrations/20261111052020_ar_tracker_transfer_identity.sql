-- Transfer identity only. No provider/date/billing/mail operations exist in SQL.
create table ar_private.tracker_transfer_writes(
 id uuid primary key default gen_random_uuid(),transfer_id bigint not null unique references ar_private.tracker_identity_transfers(id),
 region text not null,row_key text not null,new_row_key text not null,hotel text not null,account_id text not null,invoice_id text not null,
 old_identity jsonb not null,expected_agent text not null,agent text not null,account_no text not null,
 state text not null default 'pending' check(state in('pending','uncertain','written','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table ar_private.tracker_transfer_writes enable row level security;
revoke all on ar_private.tracker_transfer_writes from public,anon,authenticated,service_role;
create index tracker_transfer_event_lookup on ar_private.tracker_identity_transfers(region,row_key,id desc);
create index tracker_transfer_alias_scope on ar_private.tracker_rows(region,hotel,account_id)
 where present and policy_identity_verified;
create index tracker_transfer_writes_pending on ar_private.tracker_transfer_writes(region,state,created_at) where state in('pending','uncertain');

create function ar_private.tracker_transfer_candidates(p_region text) returns table(
 transfer_id bigint,region text,row_key text,new_row_key text,hotel text,account_id text,invoice_id text,
 old_identity jsonb,expected_agent text,agent text,account_no text
) language sql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
 with candidates as(
 select t.id as transfer_id,r.region,r.row_key,r.hotel,r.account_id,r.invoice_id,
 jsonb_build_object('hotel',r.hotel,'accountNo',r.identity->>'accountNo','invoiceNo',r.identity->>'invoiceNo',
  'folio',r.identity->>'folio','transactionDate',r.identity->>'transactionDate') as old_identity,
 r.identity->>'agent' as expected_agent,
 coalesce(alias.agent,regexp_replace(btrim(a.name),'\s+',' ','g')) as agent,a.account_no,
 r.identity->>'property' as property
 from ar_private.tracker_rows r
 join lateral(select x.* from ar_private.tracker_identity_transfers x where x.region=r.region and x.row_key=r.row_key order by x.id desc limit 1)t on true
 join public.ar_invoices i on(i.hotel,i.account_id,i.id)=(r.hotel,r.account_id,r.invoice_id)
 join public.ar_accounts a on(a.hotel,a.id)=(i.hotel,i.account_id)
 join lateral(
  select min(regexp_replace(btrim(p.identity->>'agent'),'\s+',' ','g')) as agent,
   count(distinct regexp_replace(btrim(p.identity->>'agent'),'\s+',' ','g')) as names
  from ar_private.tracker_rows p where p.region=r.region and p.hotel=r.hotel and p.account_id=r.account_id
   and p.present and p.policy_identity_verified and p.row_key<>r.row_key and p.identity->>'accountNo'=a.account_no
   and nullif(btrim(p.identity->>'agent'),'') is not null
 )alias on alias.names<=1
 where r.region=p_region and r.present and r.policy_identity_verified
 and (t.new_hotel,t.new_account,t.new_invoice)=(r.hotel,r.account_id,r.invoice_id) and t.old_account is distinct from t.new_account
 and (t.new_identity->>'agent',t.new_identity->>'accountNo')=(r.identity->>'agent',r.identity->>'accountNo')
 and nullif(r.identity->>'folio','') is not null and nullif(r.identity->>'transactionDate','') is not null
 and (i.invoice_no,i.folio_no,i.transaction_date::text)=(r.identity->>'invoiceNo',r.identity->>'folio',r.identity->>'transactionDate')
 and i.open<>0 and i.verification_state='verified' and i.synced_at>=now()-interval '30 minutes' and a.verification_state='verified'
 and ar_private.tracker_source_eligible(r.hotel,r.account_id,r.invoice_id)
 and (select count(*) from ar_private.tracker_policy_match(r.identity))=1
 and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.field='identity' and c.status='pending')
 and not exists(select 1 from ar_private.tracker_sent_row_jobs j where j.region=r.region and j.hotel=r.hotel and j.state in('writing','uncertain') and j.invoice_id in(t.old_invoice,t.new_invoice))
 )
 select transfer_id,region,row_key,
 property||'|'||agent||substring(row_key from length(property||'|'||expected_agent)+1) as new_row_key,
 hotel,account_id,invoice_id,old_identity,expected_agent,agent,account_no
 from candidates
 where nullif(btrim(account_no),'') is not null and length(account_no)<=200 and length(agent) between 1 and 200
 and agent!~'[[:cntrl:]|]' and expected_agent!~'[[:cntrl:]|]' and account_no!~'[[:cntrl:]]'
 and nullif(property,'') is not null
 and left(row_key,length(property||'|'||expected_agent||'|'))=property||'|'||expected_agent||'|'
 and length(property||'|'||agent||substring(row_key from length(property||'|'||expected_agent)+1))<=500
 and (old_identity->>'accountNo' is distinct from account_no or expected_agent is distinct from agent);
$$;

create function public.ar_tracker_transfer_jobs(p_actor uuid,p_region text,p_lock uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 insert into ar_private.tracker_transfer_writes(transfer_id,region,row_key,new_row_key,hotel,account_id,invoice_id,old_identity,expected_agent,agent,account_no)
 select transfer_id,region,row_key,new_row_key,hotel,account_id,invoice_id,old_identity,expected_agent,agent,account_no
 from ar_private.tracker_transfer_candidates(p_region)c
 where not exists(select 1 from ar_private.tracker_transfer_writes j where j.transfer_id=c.transfer_id and j.state in('uncertain','written'))
 order by transfer_id limit 10
 on conflict(transfer_id) do update set new_row_key=excluded.new_row_key,agent=excluded.agent,account_no=excluded.account_no,state='pending',updated_at=clock_timestamp()
 where tracker_transfer_writes.state in('pending','cancelled') and
 (tracker_transfer_writes.new_row_key,tracker_transfer_writes.agent,tracker_transfer_writes.account_no,tracker_transfer_writes.state)
 is distinct from(excluded.new_row_key,excluded.agent,excluded.account_no,'pending');
 update ar_private.tracker_transfer_writes j set state='cancelled',updated_at=clock_timestamp()
 where j.region=p_region and j.state='pending' and not exists(
  select 1 from ar_private.tracker_transfer_candidates(p_region)c where
  (c.transfer_id,c.row_key,c.new_row_key,c.account_id,c.invoice_id,c.old_identity,c.agent,c.account_no)=
  (j.transfer_id,j.row_key,j.new_row_key,j.account_id,j.invoice_id,j.old_identity,j.agent,j.account_no));
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'state',q.state,'write',
  jsonb_build_object('rowKey',q.row_key,'newRowKey',q.new_row_key,'expectedIdentity',q.old_identity,
   'expectedAgent',q.expected_agent,'agent',q.agent,'accountNo',q.account_no)))
  from(select * from(
   select j.*,row_number() over(partition by state order by updated_at,id) as position
   from ar_private.tracker_transfer_writes j where region=p_region and state in('pending','uncertain'))ranked
   where state<>'uncertain' or position<=5 order by (state='uncertain') desc,updated_at,id limit 10)q),'[]'::jsonb);
end $$;

create function public.ar_tracker_transfer_result(p_actor uuid,p_region text,p_lock uuid,p_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j ar_private.tracker_transfer_writes;
begin
 perform ar_private.tracker_authorize(p_actor,p_region);
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 if p_state not in('uncertain','written','retry','defer') then raise exception 'tracker_transfer_invalid';end if;
 select * into strict j from ar_private.tracker_transfer_writes where id=p_id and region=p_region for update;
 if j.state='pending' and p_state='defer' then
  update ar_private.tracker_transfer_writes set updated_at=clock_timestamp() where id=j.id returning * into j;
 elsif j.state='pending' and p_state='uncertain' then
  if exists(select 1 from ar_private.tracker_transfer_candidates(p_region)c where
   (c.transfer_id,c.row_key,c.new_row_key,c.account_id,c.invoice_id,c.old_identity,c.agent,c.account_no)=
   (j.transfer_id,j.row_key,j.new_row_key,j.account_id,j.invoice_id,j.old_identity,j.agent,j.account_no)) then
   update ar_private.tracker_transfer_writes set state='uncertain',updated_at=clock_timestamp() where id=j.id returning * into j;
  else update ar_private.tracker_transfer_writes set state='cancelled',updated_at=clock_timestamp() where id=j.id returning * into j;
  end if;
 elsif j.state='uncertain' then
  if p_state='written' then update ar_private.tracker_transfer_writes set state='written',updated_at=clock_timestamp() where id=j.id returning * into j;
  elsif p_state='retry' then update ar_private.tracker_transfer_writes set state='pending',updated_at=clock_timestamp() where id=j.id returning * into j;
  end if;
 end if;
 return jsonb_build_object('state',j.state);
end $$;
revoke all on function ar_private.tracker_transfer_candidates(text),public.ar_tracker_transfer_jobs(uuid,text,uuid),public.ar_tracker_transfer_result(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ar_tracker_transfer_jobs(uuid,text,uuid),public.ar_tracker_transfer_result(uuid,text,uuid,uuid,text) to service_role;
