-- Existing rows fail closed until a fresh scoped OPERA relationship audit.
alter table public.ar_invoices
  add column compressed boolean,
  add column parent_invoice_no text,
  add column parent_invoice_id text,
  add column parent_open numeric,
  add column collection_role text not null default 'unverified'
    check (collection_role in ('unverified','standalone','parent','child')),
  add column collection_selectable boolean generated always as
    (collection_role in ('standalone','parent') and open>0 and verification_state='verified') stored;
alter table public.ar_invoices add constraint ar_compression_context check (
  collection_role='unverified' or
  (collection_role='standalone' and compressed=false and parent_invoice_no is null) or
  (collection_role='parent' and compressed=true and parent_invoice_no is null) or
  (collection_role='child' and compressed=false and parent_invoice_no is not null and parent_invoice_id is not null and parent_open is not null)
);
create or replace function public.ar_publish_refresh(p_run_id uuid,p_expected_accounts integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs; s ar_private.refresh_stage; a jsonb; i jsonb; published_at timestamptz;
begin
  select * into r from ar_private.refresh_runs where id=p_run_id;
  if not found then raise exception 'refresh_run_missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
  select * into r from ar_private.refresh_runs where id=p_run_id for update;
  if r.status='succeeded' then return; end if;
  if r.status<>'running' or r.lease_until<=clock_timestamp() then raise exception 'refresh_lease_invalid'; end if;
  if p_expected_accounts is null or p_expected_accounts<0
    or (r.account_id is not null and p_expected_accounts<>1)
    or (select count(*) from ar_private.refresh_stage where job_id=r.id)<>p_expected_accounts then
    raise exception 'refresh_incomplete';
  end if;
  published_at:=clock_timestamp();
  for s in select * from ar_private.refresh_stage where job_id=r.id loop
    a:=s.payload->'account';
    insert into public.ar_accounts(hotel,id,name,type,account_no,open,over90,items,currency,"creditLimit",oldest,"agingBuckets","sourceWarnings",business_date,verification_state,synced_at)
    values(r.hotel,a->>'id',a->>'name',a->>'type',a->>'account_no',(a->>'open')::numeric,(a->>'over90')::numeric,
      (a->>'items')::integer,a->>'currency',(a->>'creditLimit')::numeric,(a->>'oldest')::integer,a->'agingBuckets',coalesce(a->'sourceWarnings','[]'::jsonb),
      (a->>'business_date')::date,'verified',published_at)
    on conflict(hotel,id) do update set name=excluded.name,type=excluded.type,account_no=excluded.account_no,
      open=excluded.open,over90=excluded.over90,items=excluded.items,currency=excluded.currency,
      "creditLimit"=excluded."creditLimit",oldest=excluded.oldest,"agingBuckets"=excluded."agingBuckets","sourceWarnings"=excluded."sourceWarnings",
      business_date=excluded.business_date,verification_state=excluded.verification_state,synced_at=excluded.synced_at;
    insert into ar_private.refresh_quality(run_id,hotel,account_id,warnings) values(r.id,r.hotel,s.account_id,coalesce(a->'sourceWarnings','[]'::jsonb));
    for i in select value from jsonb_array_elements(s.payload->'invoices') loop
      insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,aging,age,
        current_amount,applied_amount,reference,reservation_id,folio_date,internal_folio_window_id,compressed,parent_invoice_no,collection_role,parent_invoice_id,parent_open,verification_state,synced_at)
      values(r.hotel,s.account_id,i->>'id',i->>'guest',i->>'invoice_no',i->>'folio_no',(i->>'transaction_date')::date,
        (i->>'original')::numeric,(i->>'open')::numeric,i->>'aging',(i->>'age')::integer,(i->>'current_amount')::numeric,
        (i->>'applied_amount')::numeric,i->>'reference',i->>'reservation_id',(i->>'folio_date')::date,
        i->>'internal_folio_window_id',(i->>'compressed')::boolean,i->>'parent_invoice_no',coalesce(i->>'collection_role','unverified'),i->>'parent_invoice_id',(i->>'parent_open')::numeric,case when (i->>'open')::numeric=0 then 'cleared' else 'verified' end,published_at)
      on conflict(hotel,account_id,id) do update set guest=excluded.guest,invoice_no=excluded.invoice_no,folio_no=excluded.folio_no,
        transaction_date=excluded.transaction_date,original=excluded.original,open=excluded.open,aging=excluded.aging,
        age=excluded.age,current_amount=excluded.current_amount,applied_amount=excluded.applied_amount,
        reference=excluded.reference,reservation_id=excluded.reservation_id,folio_date=excluded.folio_date,
        internal_folio_window_id=excluded.internal_folio_window_id,compressed=excluded.compressed,parent_invoice_no=excluded.parent_invoice_no,collection_role=excluded.collection_role,parent_invoice_id=excluded.parent_invoice_id,parent_open=excluded.parent_open,verification_state=excluded.verification_state,synced_at=excluded.synced_at;
    end loop;
    update public.ar_invoices inv set verification_state='missing'
      where inv.hotel=r.hotel and inv.account_id=s.account_id
      and inv.verification_state<>'cleared'
      and not exists(select 1 from jsonb_array_elements(s.payload->'invoices') v where v->>'id'=inv.id);
  end loop;
  if r.account_id is null then
    update public.ar_accounts ac set verification_state='missing' where ac.hotel=r.hotel
      and not exists(select 1 from ar_private.refresh_stage st where st.job_id=r.id and st.account_id=ac.id);
    update public.ar_invoices inv set verification_state='missing' where inv.hotel=r.hotel
      and inv.verification_state<>'cleared'
      and not exists(select 1 from ar_private.refresh_stage st where st.job_id=r.id and st.account_id=inv.account_id);
    update public.ar_refresh_state set last_success_at=published_at,status='succeeded',error_code=null,run_id=r.id where hotel=r.hotel;
  end if;
  update ar_private.refresh_runs set status='succeeded',finished_at=published_at,lease_until=null,error_code=null where id=r.id;
  delete from ar_private.refresh_stage where job_id=r.id;
end; $$;

revoke all on function public.ar_publish_refresh(uuid,integer) from public,anon,authenticated;
grant execute on function public.ar_publish_refresh(uuid,integer) to service_role;
