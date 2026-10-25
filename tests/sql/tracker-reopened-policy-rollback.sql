-- Synthetic source transitions; never invokes provider send or Sheet writes.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-REOPEN-POLICY-'||gen_random_uuid();h text;d date:=current_date-20;before_workflow jsonb;before_sent bigint;observations bigint;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 select count(*) into before_sent from public.ar_sent_events;
 -- Six financially enabled hotels. TSUN remains pre-opening under its existing schema.
 foreach h in array array['KAT','TSK','TLKL','WAKL','TLFO','TSAN'] loop
  insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values(h,scope,scope,'Synthetic reopened policy','SYNTHETIC',100,0,1,'verified');
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'i','SYNTH-REOPEN-I','SYNTH-REOPEN-F',d,100,0,'cleared','standalone',false,now());
  update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=d+1,last_reminder_stage='Follow 1',last_reminder_date=d+5 where hotel=h and account_id=scope and invoice_id='i';
  select to_jsonb(w) into before_workflow from public.ar_invoice_workflow w where hotel=h and account_id=scope and invoice_id='i';
  update public.ar_invoices set open=75,verification_state='verified',synced_at=now() where hotel=h and account_id=scope and id='i';
  if exists(select 1 from public.ar_invoice_exceptions where hotel=h and account_id=scope and invoice_id='i' and needs_review) then raise exception 'verified reopened balance still requires explicit review for %',h;end if;
  if ar_private.invoice_exception_handoff(h,scope,array['i']) is not null then raise exception 'verified reopened balance blocks normal handoff for %',h;end if;
  if not exists(select 1 from ar_private.invoice_exception_history where hotel=h and account_id=scope and invoice_id='i' and action='source_reopened' and transition->>'fromOpen'='0.00' and transition->>'toOpen'='75.00') then raise exception 'reopened observation history lost for %',h;end if;
  if not exists(select 1 from ar_private.invoice_verified_balances where hotel=h and account_id=scope and invoice_id='i' and last_open=75 and zero_since is null) then raise exception 'reopened source retained zero/retention state for %',h;end if;
  if (select to_jsonb(w) from public.ar_invoice_workflow w where hotel=h and account_id=scope and invoice_id='i') is distinct from before_workflow then raise exception 'reopening reset billing/reminder facts for %',h;end if;
  select count(*) into observations from ar_private.invoice_exception_history where hotel=h and account_id=scope and invoice_id='i';
  update public.ar_invoices set synced_at=now() where hotel=h and account_id=scope and id='i';
  if (select count(*) from ar_private.invoice_exception_history where hotel=h and account_id=scope and invoice_id='i')<>observations then raise exception 'ordinary refresh duplicated reopening observation';end if;
  -- A remaining old automatic flag is released on a verified refresh, while a
  -- user-authored hold, note and dispute remain exactly intact.
  update public.ar_invoice_exceptions set needs_review=true,review_reason='Verified OPERA balance reopened',held=true,hold_reason='Synthetic manual hold',note='Preserve note',dispute='Preserve dispute' where hotel=h and account_id=scope and invoice_id='i';
  update public.ar_invoices set synced_at=now() where hotel=h and account_id=scope and id='i';
  if not exists(select 1 from public.ar_invoice_exceptions where hotel=h and account_id=scope and invoice_id='i' and not needs_review and held and hold_reason='Synthetic manual hold' and note='Preserve note' and dispute='Preserve dispute') then raise exception 'legacy automatic release altered independent flags for %',h;end if;
  if ar_private.invoice_exception_handoff(h,scope,array['i'])<>'email_invoice_on_hold' then raise exception 'independent hold no longer blocks handoff';end if;
  update public.ar_invoice_exceptions set needs_review=true,review_reason='Synthetic unrelated review' where hotel=h and account_id=scope and invoice_id='i';
  update public.ar_invoices set open=0,verification_state='cleared' where hotel=h and account_id=scope and id='i';
  update public.ar_invoices set open=60,verification_state='verified' where hotel=h and account_id=scope and id='i';
  if not exists(select 1 from public.ar_invoice_exceptions where hotel=h and account_id=scope and invoice_id='i' and needs_review and review_reason='Synthetic unrelated review' and held) then raise exception 'reopening cleared a different review reason';end if;
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'unknown','SYNTH-UNKNOWN',d,100,0,'unknown','standalone',false,now());
  update public.ar_invoices set open=80,verification_state='verified' where hotel=h and account_id=scope and id='unknown';
  if exists(select 1 from ar_private.invoice_exception_history where hotel=h and account_id=scope and invoice_id='unknown' and action='source_reopened') then raise exception 'unknown placeholder became an alleged verified zero';end if;
 end loop;
 if (select count(*) from public.ar_sent_events)<>before_sent then raise exception 'policy change fabricated a Sent fact';end if;
end $$;
rollback;
