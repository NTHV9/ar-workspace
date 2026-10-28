-- Synthetic only. Historical child exclusion is a read projection, never a balance repair.
begin;
do $$
declare actor uuid; a text:='SYNTHETIC-CURRENT-COUNT-'||gen_random_uuid();
 p timestamptz:=now()-interval '1 hour'; d date:=(now() at time zone 'Asia/Bangkok')::date;
 r jsonb; before_rows jsonb; n integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at,"agingBuckets")
 values('TSK',a,'Synthetic Current Count','SYNTHETIC_CURRENT_COUNT',0,0,8,'verified',p,
 '[{"label":"Up to 30","start":0,"end":30,"sequence":1,"amount":0,"debit":0,"credit":0}]');
 update public.ar_refresh_state set last_success_at=p where hotel='TSK';
 -- Four positive and four negative invoices are eight open roots, even with zero account net.
 for n in 1..8 loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
  values('TSK',a,'ROOT-'||n,n::text,d-10,case when n<=4 then n*10 else -(n-4)*10 end,
   case when n<=4 then n*10 else -(n-4)*10 end,10,'verified','standalone',false,p);
 end loop;
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a,p_details=>true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '8'
  or r->'summary'->>'amount' is distinct from '0.00' or r->>'total' is distinct from '8'
  then raise exception 'nonzero offsetting roots were not counted individually: %',r;end if;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at)
 values('TSK',a,'OLD-CHILD','OLD-CHILD',d-100,25,25,100,'missing','child',false,'OLD-PARENT','OLD-PARENT-NO',0,p-interval '1 day');
 select jsonb_agg(to_jsonb(i) order by id) into before_rows from public.ar_invoices i where hotel='TSK' and account_id=a;
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a,p_details=>true);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '8'
  or r->'summary'->>'amount' is distinct from '0.00' or r->>'total' is distinct from '8'
  or r->'accounts'->0->'membership'->>'state' is distinct from 'resolved'
  then raise exception 'historical missing child blocked reconciled current root count: %',r;end if;
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a,p_bucket=>'["Up to 30",0,30,1]',p_details=>true,p_offset=>4,p_limit=>4);
 if r->>'complete' is distinct from 'true' or r->>'total' is distinct from '8' or jsonb_array_length(r->'rows')<>4
  or exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'invoiceId'='OLD-CHILD') then raise exception 'bucket pagination included historical child';end if;
 if before_rows is distinct from (select jsonb_agg(to_jsonb(i) order by id) from public.ar_invoices i where hotel='TSK' and account_id=a) then raise exception 'count projection wrote source invoices';end if;
 -- The same exclusion also works for positive current exposure, without net cancellation.
 update public.ar_accounts set open=50,"agingBuckets"=jsonb_set(jsonb_set("agingBuckets",'{0,amount}','50'),'{0,debit}','50') where hotel='TSK' and id=a;
 update public.ar_invoices set open=10 where hotel='TSK' and account_id=a and id='ROOT-8';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '8' or r->'summary'->>'amount' is distinct from '50.00' then raise exception 'positive current exposure remained blocked';end if;
 update public.ar_accounts set open=0,"agingBuckets"=jsonb_set(jsonb_set("agingBuckets",'{0,amount}','0'),'{0,debit}','0') where hotel='TSK' and id=a;
 update public.ar_invoices set open=-40 where hotel='TSK' and account_id=a and id='ROOT-8';
 -- A present conflicting parent, future child or stale current root cannot borrow the exclusion.
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('TSK',a,'CONFLICT-PARENT','OLD-PARENT-NO',d-10,0,0,10,'verified','standalone',false,p);
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'conflicting present parent ignored';end if;
 delete from public.ar_invoices where hotel='TSK' and account_id=a and id='CONFLICT-PARENT';
 update public.ar_invoices set synced_at=p+interval '1 second' where hotel='TSK' and account_id=a and id='OLD-CHILD';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'future child ignored';end if;
 update public.ar_invoices set synced_at=p-interval '1 day' where hotel='TSK' and account_id=a and id='OLD-CHILD';
 update public.ar_invoices set synced_at=p-interval '1 second' where hotel='TSK' and account_id=a and id='ROOT-1';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'stale current root borrowed historical exclusion';end if;
 update public.ar_invoices set synced_at=p where hotel='TSK' and account_id=a and id='ROOT-1';
 -- No blanket child bypass: current/malformed/positive-parent evidence still blocks.
 update public.ar_invoices set synced_at=p where hotel='TSK' and account_id=a and id='OLD-CHILD';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'current missing child silently discarded';end if;
 update public.ar_invoices set synced_at=p-interval '1 day',parent_open=10 where hotel='TSK' and account_id=a and id='OLD-CHILD';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'positive unresolved parent silently discarded';end if;
 update public.ar_invoices set parent_open=0,parent_invoice_id='' where hotel='TSK' and account_id=a and id='OLD-CHILD';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'missing lineage silently discarded';end if;
 update public.ar_invoices set parent_invoice_id='OLD-PARENT' where hotel='TSK' and account_id=a and id='OLD-CHILD';
 update public.ar_invoices set open=11 where hotel='TSK' and account_id=a and id='ROOT-1';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'unreconciled roots allowed historical exclusion';end if;
 update public.ar_invoices set open=10,verification_state='missing' where hotel='TSK' and account_id=a and id='ROOT-1';
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'TSK',p_tsk_account=>a);
 if r->>'complete' is distinct from 'false' then raise exception 'missing current root was ignored';end if;
 if public.ar_aging_invoice_status(gen_random_uuid(),p_hotel=>'TSK',p_tsk_account=>a)->>'error' is distinct from 'aging_forbidden' then raise exception 'count repair widened access';end if;
end$$;
rollback;
