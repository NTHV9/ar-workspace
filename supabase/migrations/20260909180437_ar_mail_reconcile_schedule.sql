alter table ar_private.mail_deliveries add column reconcile_checked_at timestamptz;
create table ar_private.mail_reconcile_runs(
 id uuid primary key default gen_random_uuid(),trigger text not null check(trigger in ('manual','scheduled')),
 state text not null check(state in ('queued','running','complete','failed')),created_at timestamptz not null default now(),finished_at timestamptz,
 lease_until timestamptz not null,deliveries jsonb not null,checked integer not null default 0,verified integer not null default 0,needs_review integer not null default 0,unavailable integer not null default 0
);
revoke all on ar_private.mail_reconcile_runs from public,anon,authenticated;
create function public.ar_mail_reconcile_request(p_trigger text,p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.mail_reconcile_runs;items jsonb;
begin
 if p_trigger not in ('manual','scheduled') or p_limit not between 1 and 20 then return jsonb_build_object('error','reconcile_invalid');end if;
 perform pg_advisory_xact_lock(61704,815);
 select * into r from ar_private.mail_reconcile_runs where state in ('queued','running') and lease_until>now() order by created_at desc limit 1;
 if found then return jsonb_build_object('id',r.id,'created',false,'state',r.state);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',owner)),'[]') into items from (
  select m.id,m.owner from ar_private.mail_deliveries m join auth.users u on u.id=m.owner
  where m.mode<>'test' and m.state in ('pending','created','awaiting_evidence') and m.created_at<now()-interval '90 seconds'
  and lower(u.email)='ar@katathani.com' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  order by m.reconcile_checked_at nulls first,m.created_at,m.id limit p_limit
 ) selected;
 insert into ar_private.mail_reconcile_runs(trigger,state,lease_until,deliveries,finished_at)
 values(p_trigger,case when jsonb_array_length(items)=0 then 'complete' else 'queued' end,now()+interval '15 minutes',items,case when jsonb_array_length(items)=0 then now() end) returning * into r;
 update ar_private.mail_deliveries set reconcile_checked_at=now() where id in(select (value->>'id')::uuid from jsonb_array_elements(items));
 return jsonb_build_object('id',r.id,'created',true,'state',r.state);
end $$;
create function public.ar_mail_reconcile_get(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.mail_reconcile_runs;
begin
 update ar_private.mail_reconcile_runs set state='running' where id=p_id and state='queued' and lease_until>now();
 select * into r from ar_private.mail_reconcile_runs where id=p_id;return to_jsonb(r);
end $$;
create function public.ar_mail_reconcile_finish(p_id uuid,p_checked integer,p_verified integer,p_review integer,p_unavailable integer,p_failed boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update ar_private.mail_reconcile_runs set state=case when p_failed then 'failed' else 'complete' end,finished_at=now(),lease_until=now(),checked=p_checked,verified=p_verified,needs_review=p_review,unavailable=p_unavailable
 where id=p_id and state in ('queued','running');return found;
end $$;
create function public.ar_mail_reconcile_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('last',(select to_jsonb(r)-'deliveries'-'lease_until' from ar_private.mail_reconcile_runs r order by created_at desc limit 1),
 'waiting',(select count(*) from ar_private.mail_deliveries where mode<>'test' and state in ('pending','created','awaiting_evidence')),
 'needsReview',(select count(*) from ar_private.mail_deliveries where mode<>'test' and state='review_required'));
$$;
revoke all on function public.ar_mail_reconcile_request(text,integer),public.ar_mail_reconcile_get(uuid),public.ar_mail_reconcile_finish(uuid,integer,integer,integer,integer,boolean),public.ar_mail_reconcile_status() from public,anon,authenticated;
grant execute on function public.ar_mail_reconcile_request(text,integer),public.ar_mail_reconcile_get(uuid),public.ar_mail_reconcile_finish(uuid,integer,integer,integer,integer,boolean),public.ar_mail_reconcile_status() to service_role;
