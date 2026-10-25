-- Owner policy: a verified reopened balance resumes normal collection work.
-- Preserve observed transitions, durable zero evidence, dates, Sent and manual holds.
create function ar_private.release_automatic_reopen_review(p_hotel text,p_account text,p_invoice text)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.ar_invoice_exceptions;
begin
 update public.ar_invoice_exceptions x set needs_review=false,review_reason=null,revision=x.revision+1,updated_at=now()
 where (x.hotel,x.account_id,x.invoice_id)=(p_hotel,p_account,p_invoice)
 and x.needs_review and x.review_reason='Verified OPERA balance reopened'
 and exists(select 1 from public.ar_invoices i where (i.hotel,i.account_id,i.id)=(x.hotel,x.account_id,x.invoice_id) and i.verification_state in('verified','cleared'))
 returning x.* into e;
 if not found then return false;end if;
 insert into ar_private.invoice_exception_history(hotel,account_id,invoice_id,revision,actor,action,reason,snapshot,transition)
 values(e.hotel,e.account_id,e.invoice_id,e.revision,null,'policy_allow_reopened',
  'Owner policy: verified reopened balances follow normal collection work',
  ar_private.invoice_exception_json(e.hotel,e.account_id,e.invoice_id),null);
 return true;
end $$;
revoke all on function ar_private.release_automatic_reopen_review(text,text,text) from public,anon,authenticated,service_role;

create or replace function ar_private.invoice_reopened_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.ar_invoice_exceptions;prior ar_private.invoice_verified_balances;previous_open numeric;
begin
 if tg_op='UPDATE' and row(old.hotel,old.account_id,old.id) is distinct from row(new.hotel,new.account_id,new.id) then return new;end if;
 if new.verification_state not in('verified','cleared') then return new;end if;
 select * into prior from ar_private.invoice_verified_balances where hotel=new.hotel and account_id=new.account_id and invoice_id=new.id for update;
 previous_open:=prior.last_open;
 if prior.invoice_id is null and tg_op='UPDATE' and old.verification_state in('verified','cleared') then previous_open:=old.open;end if;
 insert into ar_private.invoice_verified_balances(hotel,account_id,invoice_id,last_open,verified_at,zero_since)
 values(new.hotel,new.account_id,new.id,new.open,new.synced_at,case when new.open=0 then case when previous_open=0 then coalesce(prior.zero_since,now()) else now() end end)
 on conflict(hotel,account_id,invoice_id) do update set last_open=excluded.last_open,verified_at=excluded.verified_at,zero_since=excluded.zero_since;
 -- Also heals a legacy automatic flag after an unknown source becomes verified.
 perform ar_private.release_automatic_reopen_review(new.hotel,new.account_id,new.id);
 if previous_open is distinct from 0 or new.open=0 or new.verification_state<>'verified' then return new;end if;
 insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,revision,needs_review,review_reason,reopened_at)
 values(new.hotel,new.account_id,new.id,1,false,null,now())
 on conflict(hotel,account_id,invoice_id) do update set revision=public.ar_invoice_exceptions.revision+1,reopened_at=now(),updated_at=now() returning * into e;
 insert into ar_private.invoice_exception_history(hotel,account_id,invoice_id,revision,actor,action,reason,snapshot,transition)
 values(new.hotel,new.account_id,new.id,e.revision,null,'source_reopened','Verified zero balance became nonzero in OPERA',
  ar_private.invoice_exception_json(new.hotel,new.account_id,new.id),jsonb_build_object('fromOpen',round(previous_open,2)::text,'toOpen',round(new.open,2)::text));
 return new;
end $$;

-- Release only the former automatic reason with verified current source. Other
-- review reasons and held/dispute/note fields are deliberately outside this update.
do $$
declare r record;n integer:=0;
begin
 for r in select e.hotel,e.account_id,e.invoice_id from public.ar_invoice_exceptions e
 join public.ar_invoices i on(i.hotel,i.account_id,i.id)=(e.hotel,e.account_id,e.invoice_id)
 where e.needs_review and e.review_reason='Verified OPERA balance reopened' and i.verification_state in('verified','cleared')
 order by e.hotel,e.account_id,e.invoice_id loop
  if ar_private.release_automatic_reopen_review(r.hotel,r.account_id,r.invoice_id) then n:=n+1;end if;
 end loop;
 raise notice 'Released % former automatic reopen-review flags; all business facts retained',n;
end $$;
notify pgrst,'reload schema';
