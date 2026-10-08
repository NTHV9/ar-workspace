-- Synthetic only. Qualified Aging membership; no provider effects or persisted age updates.
begin;
do $$
declare schema jsonb:='[{"label":"Up to 30","start":0,"end":30,"sequence":1,"amount":0,"debit":0,"credit":0},{"label":"31 - 60","start":31,"end":60,"sequence":2,"amount":0,"debit":0,"credit":0},{"label":"61+","start":61,"end":null,"sequence":3,"amount":0,"debit":0,"credit":0}]';
 roots jsonb:='[{"id":"0","age":0,"open":10},{"id":"30","age":30,"open":20},{"id":"31","age":31,"open":30},{"id":"32","age":32,"open":40},{"id":"60","age":60,"open":50},{"id":"61","age":61,"open":60},{"id":"62","age":62,"open":70},{"id":"credit","age":61,"open":-5}]';
 buckets jsonb;r jsonb;delta integer;expected jsonb;bad jsonb;
begin
 for delta in 0..1 loop
  select jsonb_agg(b || jsonb_build_object('debit',v.debit,'credit',v.credit,'amount',v.debit-v.credit) order by (b->>'sequence')::integer)
  into buckets from jsonb_array_elements(schema)b cross join lateral(
   select coalesce(sum((i->>'open')::numeric),0) as debit,0::numeric as credit
   from jsonb_array_elements(roots)i where greatest((i->>'age')::integer-delta,0)>=(b->>'start')::integer and (b->'end'='null'::jsonb or greatest((i->>'age')::integer-delta,0)<=(b->>'end')::integer))v;
  r:=ar_private.aging_source_membership(buckets,roots,275,true);
  if r->>'state'<>'resolved' or (r->>'offsetDays')::integer<>-delta then raise exception 'qualified boundary candidate failed: %',r;end if;
  if (r->'buckets'->>'31')::jsonb<>(case when delta=1 then '["Up to 30",0,30,1]'::jsonb else '["31 - 60",31,60,2]'::jsonb end)
   or (r->'buckets'->>'61')::jsonb<>(case when delta=1 then '["31 - 60",31,60,2]'::jsonb else '["61+",61,null,3]'::jsonb end)
   or (r->'buckets'->>'0')::jsonb<>'["Up to 30",0,30,1]'::jsonb then raise exception 'completed-day boundary mapping incorrect';end if;
  if ar_private.aging_source_membership(buckets,roots,275,false)->>'state'<>'unavailable' then raise exception 'invalid publication accepted';end if;
  foreach bad in array array[jsonb_set(roots,'{0,age}','null'),jsonb_set(roots,'{0,age}','-1'),jsonb_set(roots,'{0,age}','0.5'),roots||roots->0,jsonb_set(roots,'{0,open}','0'),jsonb_set(roots,'{0,id}','null')] loop
   if ar_private.aging_source_membership(buckets,bad,275,true)->>'state'<>'unavailable' then raise exception 'unknown/malformed/duplicate root accepted';end if;
  end loop;
  if ar_private.aging_source_membership(jsonb_set(buckets,'{0,debit}','999'),roots,275,true)->>'state'<>'unavailable'
   or ar_private.aging_source_membership(buckets,roots,276,true)->>'state'<>'unavailable' then raise exception 'native identity or account total ignored';end if;
 end loop;
 -- Both candidates produce exactly the same mapping, so canonical offset is zero.
 r:=ar_private.aging_source_membership('[{"label":"Up to 30","start":0,"end":30,"sequence":1,"amount":10,"debit":10,"credit":0}]','[{"id":"A","age":20,"open":10}]',10,true);
 if r->>'state'<>'resolved' or r->>'offsetDays'<>'0' then raise exception 'identical candidate mapping did not resolve canonically';end if;
 -- Equal signed debit/net permits both candidates, but different identities are ambiguous.
 r:=ar_private.aging_source_membership(schema,'[{"id":"A","age":31,"open":100},{"id":"C","age":31,"open":-100}]',0,true);
 if r->>'state'<>'unavailable' then raise exception 'cancellation hid differing candidate identity memberships';end if;
 -- A negative invoice is signed native debit, not native account credit.
 buckets:=jsonb_set(jsonb_set(schema,'{0,amount}','-10'),'{0,debit}','-10');
 r:=ar_private.aging_source_membership(buckets,'[{"id":"NEGATIVE","age":31,"open":-10}]',-10,true);
 if r->>'state'<>'resolved' or r->>'offsetDays'<>'-1' or (r->'buckets'->>'NEGATIVE')::jsonb<>'["Up to 30",0,30,1]'::jsonb then raise exception 'negative signed-native boundary failed';end if;
 if ar_private.aging_source_membership(buckets,'[]',-10,true)->>'state'<>'unavailable' then raise exception 'nonzero native debit with empty invoice inventory resolved';end if;
 -- Existing explicit account credits remain source credits, with exact source debit.
 buckets:='[{"label":"Up to 30","start":0,"end":30,"sequence":1,"amount":80,"debit":100,"credit":20}]';
 r:=ar_private.aging_source_membership(buckets,'[{"id":"A","age":20,"open":100}]',80,true);
 if r->>'state'<>'resolved' then raise exception 'explicit source account credit was lost';end if;
 if ar_private.aging_source_membership(buckets,'[{"id":"A","age":20,"open":90}]',80,true)->>'state'<>'unavailable'
  or ar_private.aging_source_membership(buckets,'[{"id":"A","age":20,"open":100},{"id":"C","age":20,"open":-10}]',80,true)->>'state'<>'unavailable' then raise exception 'account credit excused unexplained discrepancy';end if;
end$$;
do $$
declare actor uuid;a text:='SYNTHETIC-MEMBERSHIP-'||gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;p timestamptz:=now()-interval '1 hour';r jsonb;raw_before jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at,"agingBuckets") values('KAT',a,'Synthetic Membership','SYNTHETIC_MEMBERSHIP',195,0,3,'verified',p,'[{"label":"Up to 30","start":0,"end":30,"sequence":1,"amount":100,"debit":100,"credit":0},{"label":"31 - 60","start":31,"end":60,"sequence":2,"amount":95,"debit":95,"credit":0},{"label":"61+","start":61,"end":null,"sequence":3,"amount":0,"debit":0,"credit":0}]');
 update public.ar_refresh_state set last_success_at=p,status='running' where hotel='KAT';
 r:=public.ar_access_account_publication(actor,'KAT',a);
 if jsonb_array_length(r)<>1 or r->0->>'id'<>a or r->0->>'hotel'<>'KAT' or (r->0->>'synced_at')::timestamptz<>p then raise exception 'protected exact account publication failed';end if;
 if public.ar_access_account_publication(actor,'KAT',a||'-MISSING')<>'[]'::jsonb then raise exception 'publication widened absent identity';end if;
 begin
  perform public.ar_access_account_publication(gen_random_uuid(),'KAT',a);
  raise exception 'publication admitted unknown actor';
 exception when others then if sqlerrm<>'access_forbidden' then raise;end if;end;
 if has_function_privilege('authenticated','public.ar_access_account_publication(uuid,text,text)','execute') or has_function_privilege('anon','public.ar_access_account_publication(uuid,text,text)','execute') then raise exception 'account publication RPC privilege leak';end if;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values
 ('KAT',a,'31',d-31,100,100,31,'verified','standalone',false,p),('KAT',a,'61',d-61,100,100,61,'verified','parent',true,p),('KAT',a,'CREDIT',d-61,-5,-5,61,'verified','standalone',false,p),('KAT',a,'ZERO',d-61,0,0,null,'cleared','standalone',false,p);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at) values('KAT',a,'CHILD',d-61,1,1,null,'verified','child',false,'61','61',100,p),('KAT',a,'ZERO-PARENT-CHILD',d-61,1,1,null,'verified','child',false,'ABSENT-PARENT','ABSENT-NO',0,p);
 select jsonb_agg(jsonb_build_array(id,age,transaction_date) order by id) into raw_before from public.ar_invoices where hotel='KAT' and account_id=a;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,'["31 - 60",31,60,2]',null,null,true);
 if r->>'complete'<>'true' or r->'summary'->>'count'<>'2' or r->'summary'->>'amount'<>'95.00' or r->'accounts'->0->'membership'->>'offsetDays'<>'-1'
  or exists(select 1 from jsonb_array_elements(r->'rows')x where (x->>'bucketKey')::jsonb<>'["31 - 60",31,60,2]'::jsonb or x->>'age'<>'61') then raise exception 'shifted detail/summary agreement failed: %',r;end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,'["Up to 30",0,30,1]',null,null,true);
 if r->>'complete'<>'true' or r->'rows'->0->>'invoiceId'<>'31' or r->'rows'->0->>'age'<>'31' then raise exception 'raw 31 membership failed';end if;
 if raw_before<>(select jsonb_agg(jsonb_build_array(id,age,transaction_date) order by id) from public.ar_invoices where hotel='KAT' and account_id=a) then raise exception 'Aging read changed source dates/ages';end if;
 update public.ar_invoices set synced_at=p-interval '1 second' where hotel='KAT' and account_id=a and id='31';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,null,null,null,true);
 if r->>'complete'<>'true' or r->'summary'->>'count'<>'3' or r->'summary'->>'amount'<>'195.00' or r->'accounts'->0->'membership'->>'state'<>'unavailable'
  or exists(select 1 from jsonb_array_elements(r->'rows')x where x->'bucketKey'<>'null'::jsonb) then raise exception 'stale membership erased independently known all-age inventory';end if;
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a,null,'["31 - 60",31,60,2]',null,null,true);
 if r->>'complete'<>'false' or r->'summary'->'amount'<>'null'::jsonb or r->>'total'<>'0' then raise exception 'stale publication presented bucket membership';end if;
 update public.ar_invoices set synced_at=p,age=null where hotel='KAT' and account_id=a and id='31';
 r:=public.ar_aging_invoice_status(actor,'KAT',null,a);
 if r->>'complete'<>'true' or r->'accounts'->0->'membership'->>'state'<>'unavailable' then raise exception 'unknown age invalidated independent all-age inventory';end if;
 if has_function_privilege('service_role','ar_private.aging_source_membership(jsonb,jsonb,numeric,boolean)','execute') or has_function_privilege('anon','ar_private.aging_source_membership(jsonb,jsonb,numeric,boolean)','execute') then raise exception 'private membership helper privilege leak';end if;
end$$;
rollback;

