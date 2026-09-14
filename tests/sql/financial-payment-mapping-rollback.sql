-- Synthetic normalized source facts only. No provider request or retained test data.
begin;

create function pg_temp.payment_test_row(a text,id text,posted text default '-100.00',used text default '70.00',remaining text default '30.00') returns jsonb language sql as $$
 select jsonb_build_object('hotel','KAT','accountId',a,'kind','payment','transactionId',id,'transactionDate','1906-01-12','postingDate','1906-01-12','revenueDate',null,'transferDate',null,'currency','THB','transferredIn',false,'transferredOut',false,
  'transactionCode','9000','amount',posted,'appliedAmount',used,'unallocatedAmount',remaining,'transfer','none_reported','classification','unknown','reversal','unknown');
$$;
create function pg_temp.payment_test_invoice(a text,id text,bill text default '1905-12-01',current_value text default '100.00',paid text default '70.00',open_value text default '30.00') returns jsonb language sql as $$
 select jsonb_build_object('hotel','KAT','accountId',a,'kind','invoice','transactionId',id,'transactionDate',bill,'postingDate',bill,'revenueDate',null,'transferDate',null,'currency','THB','transferredIn',false,'transferredOut',false,
  'invoiceNo',id,'folioNo',id,'invoiceType','Credit','originalAmount',current_value,'currentAmount',current_value,'cumulativePayments',paid,'openAmount',open_value,'closeDate',null,'compressed',false,'parentInvoiceNo',null,'collectionRole','standalone','entryClassification','invoice');
$$;
create function pg_temp.payment_test_link(i jsonb,p jsonb,amount_value text default '70.00') returns jsonb language sql as $$
 select jsonb_build_object('hotel',i->'hotel','accountId',i->'accountId','invoiceTransactionId',i->'transactionId','paymentTransactionId',p->'transactionId','invoiceNo',i->'invoiceNo','appliedAmount',amount_value,'currency','THB',
  'invoiceTransactionDate',i->'transactionDate','invoicePostingDate',i->'postingDate','invoiceCloseDate',i->'closeDate','applicationDate',null,'applicationEventId',null);
$$;
create function pg_temp.payment_test_start(actor uuid,a text,payments jsonb,invoices jsonb default '[]') returns uuid language plpgsql as $$
declare run uuid;coverage jsonb;n integer;
begin
 run:=(public.ar_financial_request(actor,gen_random_uuid(),'{"hotel":"KAT","reason":"backfill","from":"1906-01-12","to":"1906-01-12"}','1906-01-12','1906-01-12','synthetic-payment-proof')->>'id')::uuid;
 perform public.ar_financial_claim(actor,run);perform public.ar_financial_discovery_set(actor,run,array[a]);
 if jsonb_array_length(payments)>0 then perform public.ar_financial_stage_batch(actor,run,a,'payment',0,payments);end if;
 if jsonb_array_length(invoices)>0 then perform public.ar_financial_stage_batch(actor,run,a,'invoice',0,invoices);end if;
 n:=jsonb_array_length(payments)+jsonb_array_length(invoices);
 coverage:=jsonb_build_object('query',jsonb_build_object('hotel','KAT','accountId',a,'start','1906-01-12','end','1906-01-12','kinds','["invoice","payment"]'::jsonb),
  'observedAt',clock_timestamp(),'pagination','complete','pages',1,'members',n,'roots',n,'reportedRoots',n,'dateSemantics','unverified','financialClassification','unverified','completeForFinancialPeriod',false,'missingTransactionDates',0,'outsideRequestedTransactionDates',0,'unknownPrimaryAmounts',0);
 perform public.ar_financial_history_ready(actor,run,a,'{"name":"Synthetic payment mapping account","type":"SYNTHETIC_PAYMENT","accountNo":null}',coverage);
 return run;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-'||gen_random_uuid();run uuid;prior_run uuid;p jsonb;i jsonb;l jsonb;result jsonb;snapshot jsonb;first_seen timestamptz;published timestamptz;before_source jsonb;history_count bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 p:=pg_temp.payment_test_row(a,'301');i:=pg_temp.payment_test_invoice(a,'101');l:=pg_temp.payment_test_link(i,p);
 snapshot:=jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(l)));
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));
 if public.ar_financial_run_get(actor,run)->>'stepsVersion' is distinct from '3' then raise exception 'new payment version absent';end if;
 begin perform public.ar_financial_publish(actor,run,array[a]);raise exception 'missing payment phase published';exception when others then if sqlerrm<>'financial_payment_mapping_incomplete' then raise;end if;end;
 result:=public.ar_financial_payment_prepare(actor,run,a);
 if result->>'mappingCount' is distinct from '1' or public.ar_financial_payment_prepare(actor,run,a) is distinct from result then raise exception 'payment prepare not durable';end if;
 if public.ar_financial_payment_batch_get(actor,run,a,0)->'payments' is distinct from jsonb_build_array(p) then raise exception 'payment expected identity lost';end if;
 begin perform public.ar_financial_payment_batch_get(actor,run,a,1);raise exception 'outside batch accepted';exception when others then if sqlerrm<>'financial_payment_batch_invalid' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_get(gen_random_uuid(),run,a,0);raise exception 'actor bypass';exception when others then if sqlerrm<>'financial_forbidden' then raise;end if;end;
 begin perform public.ar_financial_payment_prepare(actor,run,a||'-OTHER');raise exception 'account bypass';exception when others then if sqlerrm<>'financial_history_incomplete' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,payment,hotel}','"TSK"'));raise exception 'cross hotel accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,links,0,appliedAmount}','"60.00"'));raise exception 'partial allocation accepted';exception when others then if sqlerrm<>'financial_payment_mapping_total' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,invoices,0,customerSecret}','"forbidden"'));raise exception 'extra source fields accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,invoices,0,collectionRole}','"child"'));raise exception 'child context accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,links,0,invoiceTransactionDate}','"1906-01-12"'));raise exception 'guessed bill date accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);
 if public.ar_financial_payment_batch_get(actor,run,a,0)->>'saved' is distinct from 'true' then raise exception 'payment receipt missing';end if;
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('paymentId','301','error','financial_mapping_changed')));raise exception 'changed replay accepted';exception when others then if sqlerrm<>'financial_payment_batch_conflict' then raise;end if;end;
 perform public.ar_financial_history_finalize(actor,run,a);
 result:=public.ar_financial_publish(actor,run,array[a]);
 if result->>'status' is distinct from 'succeeded' or result->>'invoices' is distinct from '0' or result->>'payments' is distinct from '1' or result->>'applications' is distinct from '0' then raise exception 'independent context changed date query counts';end if;
 select finished_at into published from ar_private.financial_runs where id=run;
 select first_observed_at into first_seen from ar_private.financial_applications where hotel='KAT' and account_id=a and payment_id='301';
 if first_seen is distinct from published or not exists(select 1 from ar_private.financial_invoice_entries where hotel='KAT' and account_id=a and source_date='1905-12-01' and not mapping_verified and last_observed_at=published)
  or not exists(select 1 from ar_private.financial_payments where hotel='KAT' and account_id=a and payment_mapping_verified and last_observed_at=published) then raise exception 'context/link/payment observation was not atomic';end if;
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'true' or result->'summary'->>'amount' is distinct from '70.00' or result->'summary'->>'count' is distinct from '1' then raise exception 'older bill date lost current payment mapping: %',result;end if;
 result:=public.ar_financial_report(actor,'invoice_entries','KAT',a,null,'1905-12-01','1905-12-01');
 if result->'summary'->'coverageComplete' is distinct from 'false'::jsonb then raise exception 'context lookup invented prior period coverage';end if;
 select count(*) into history_count from ar_private.financial_changes where run_id=run;
 perform public.ar_financial_publish(actor,run,array[a]);
 if (select count(*) from ar_private.financial_changes where run_id=run)<>history_count or exists(select 1 from ar_private.financial_payment_mapping_work where run_id=run) then raise exception 'publish replay retained/repeated work';end if;

 -- A rerun updates both sides together; original observation and immutable changes survive.
 prior_run:=run;run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));
 perform public.ar_financial_payment_prepare(actor,run,a);perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'true' or result->'summary'->>'amount' is distinct from '70.00' or (select first_observed_at from ar_private.financial_applications where account_id=a and payment_id='301') is distinct from first_seen
  or exists(select 1 from ar_private.financial_changes where run_id=run) then raise exception 'identical rerun made mappings stale or duplicated source history';end if;

 -- A failed proof retains previous source facts and cannot masquerade as an empty mapping.
 before_source:=(select source_data from ar_private.financial_applications where account_id=a and payment_id='301');
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 perform public.ar_financial_payment_batch_save(actor,run,a,0,'[{"paymentId":"301","error":"financial_mapping_changed"}]');
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'false' or result->'summary'->'amount' is distinct from 'null'::jsonb
  or (select source_data from ar_private.financial_applications where account_id=a and payment_id='301') is distinct from before_source then raise exception 'failed payment proof replaced known facts';end if;

 -- Explicit unallocated proof retires old links without deleting their business history.
 p:=pg_temp.payment_test_row(a,'301','-100.00','0.00','100.00');
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p,'invoices','[]'::jsonb,'links','[]'::jsonb)));
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'true' or result->'summary'->>'amount' is distinct from '0.00' or result->'rows' is distinct from '[]'::jsonb
  or not exists(select 1 from ar_private.financial_applications where account_id=a and payment_id='301' and source_status='not_observed' and source_data=before_source and first_observed_at=first_seen)
  then raise exception 'explicit zero did not retire old links safely: %',result;end if;
 -- A later failed zero must be unknown even after an earlier verified zero.
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 perform public.ar_financial_payment_batch_save(actor,run,a,0,'[{"paymentId":"301","error":"financial_mapping_payment"}]');perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'false' or result->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'failed zero became complete empty';end if;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-BATCH-'||gen_random_uuid();run uuid;rows jsonb;p jsonb;i jsonb;l jsonb;snapshot jsonb;batch jsonb;result jsonb;before_source jsonb;before_count bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select jsonb_agg(pg_temp.payment_test_row(a,n::text,'-100.00','0.00','100.00') order by n) into rows from generate_series(301,306)n;
 run:=pg_temp.payment_test_start(actor,a,rows);perform public.ar_financial_payment_prepare(actor,run,a);
 if jsonb_array_length(public.ar_financial_payment_batch_get(actor,run,a,0)->'payments')<>5 or jsonb_array_length(public.ar_financial_payment_batch_get(actor,run,a,1)->'payments')<>1 then raise exception 'payment batch is not bounded to five';end if;
 for n in 0..1 loop
  batch:=public.ar_financial_payment_batch_get(actor,run,a,n);
  select jsonb_agg(jsonb_build_object('payment',v,'invoices','[]'::jsonb,'links','[]'::jsonb) order by ord) into snapshot from jsonb_array_elements(batch->'payments') with ordinality x(v,ord);
  begin perform public.ar_financial_payment_batch_save(actor,run,a,n,'[]');raise exception 'missing batch identities accepted';exception when others then if sqlerrm<>'financial_payment_batch_invalid' then raise;end if;end;
  if n=0 then
   begin perform public.ar_financial_payment_batch_save(actor,run,a,n,jsonb_set(snapshot,'{4,payment,amount}','"-99.00"'));raise exception 'partial batch accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
   if public.ar_financial_payment_batch_get(actor,run,a,0)->>'saved' is distinct from 'false' then raise exception 'bad final row committed partial batch';end if;
  end if;
  perform public.ar_financial_payment_batch_save(actor,run,a,n,snapshot);
 end loop;
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);

 -- One invoice observed by both phases is deduplicated, and a debit correction keeps its sign.
 p:=pg_temp.payment_test_row(a,'301','20.00','10.00','10.00');i:=pg_temp.payment_test_invoice(a,'101','1906-01-12','100.00','10.00','110.00');l:=pg_temp.payment_test_link(i,p,'-10.00');
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(l),'[]');perform public.ar_financial_payment_prepare(actor,run,a);
 snapshot:=jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(l)));
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_set(snapshot,'{0,links,0,appliedAmount}','"10.00"'));raise exception 'debit application sign lost';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 if (select count(*) from ar_private.financial_changes where run_id=run and kind='invoice')<>1 or (select count(*) from ar_private.financial_changes where run_id=run and kind='application')<>1
  or not exists(select 1 from ar_private.financial_applications where account_id=a and payment_id='301' and applied_amount=-10 and source_status='observed') then raise exception 'overlapping evidence duplicated history or debit direction';end if;

 -- An independently verified PAYMENT survives failed full-invoice mapping; invoice stays unverified.
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],'{}','[]','[{"invoiceId":"101","code":"financial_mapping_changed"}]');
 perform public.ar_financial_payment_prepare(actor,run,a);perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 if not exists(select 1 from ar_private.financial_invoice_entries where account_id=a and transaction_id='101' and not mapping_verified)
  or not exists(select 1 from ar_private.financial_applications where account_id=a and payment_id='301' and source_status='observed') then raise exception 'partial invoice proof destroyed complete payment proof';end if;

 -- Contradictory context is rejected before any financial publication can change.
 before_source:=(select source_data from ar_private.financial_invoice_entries where account_id=a and transaction_id='101');
 select count(*) into before_count from ar_private.financial_publications;
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(l),'[]');perform public.ar_financial_payment_prepare(actor,run,a);
 snapshot:=jsonb_set(snapshot,'{0,invoices,0,originalAmount}','"200.00"');
 perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);perform public.ar_financial_history_finalize(actor,run,a);
 begin perform public.ar_financial_publish(actor,run,array[a]);raise exception 'contradictory publication accepted';exception when others then if sqlerrm<>'financial_payment_observation_conflict' then raise;end if;end;
 if (select count(*) from ar_private.financial_publications)<>before_count or (select source_data from ar_private.financial_invoice_entries where account_id=a and transaction_id='101') is distinct from before_source
  or exists(select 1 from ar_private.financial_changes where run_id=run) then raise exception 'atomic rejected publication wrote source/history';end if;
 perform public.ar_financial_fail(actor,run,'financial_payment_observation_conflict');
 if exists(select 1 from ar_private.financial_payment_mapping_work where run_id=run) then raise exception 'failed run retained mapping work';end if;

 -- Transfers and unreconciled/missing components can only persist an explicit failure.
 p:=pg_temp.payment_test_row(a,'901')||'{"transferredIn":true,"transfer":"in"}';
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 snapshot:=jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(pg_temp.payment_test_link(i,p))));
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);raise exception 'transfer proof accepted';exception when others then if sqlerrm<>'financial_payment_snapshot_invalid' then raise;end if;end;
 perform public.ar_financial_payment_batch_save(actor,run,a,0,'[{"paymentId":"901","error":"financial_mapping_transfer"}]');
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'false' then raise exception 'transfer became verified paid metric';end if;

 p:=pg_temp.payment_test_row(a,'902','-100.00',null,'30.00');
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 snapshot:=jsonb_build_array(jsonb_build_object('payment',p,'invoices','[]'::jsonb,'links','[]'::jsonb));
 begin perform public.ar_financial_payment_batch_save(actor,run,a,0,snapshot);raise exception 'missing amount accepted';exception when others then if sqlerrm<>'financial_payment_mapping_total' then raise;end if;end;
 update ar_private.financial_runs set lease_until=clock_timestamp()-interval '1 second' where id=run;
 begin perform public.ar_financial_payment_batch_get(actor,run,a,0);raise exception 'expired lease used';exception when others then if sqlerrm<>'financial_lease_invalid' then raise;end if;end;
 perform public.ar_financial_fail(actor,run,'financial_lease_expired');
 if has_table_privilege('service_role','ar_private.financial_payment_mapping_work','select') or has_table_privilege('authenticated','ar_private.financial_payment_mapping_work','select')
  or has_function_privilege('anon','public.ar_financial_payment_prepare(uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.ar_financial_payment_batch_get(uuid,uuid,text,integer)','execute')
  or has_function_privilege('authenticated','public.ar_financial_payment_batch_save(uuid,uuid,text,integer,jsonb)','execute')
  or not has_function_privilege('service_role','public.ar_financial_payment_batch_save(uuid,uuid,text,integer,jsonb)','execute') then raise exception 'payment work privilege leak';end if;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-REALLOCATION-'||gen_random_uuid();run uuid;p jsonb;i jsonb;l jsonb;result jsonb;first_seen timestamptz;tsk_run uuid:=gen_random_uuid();tsk_before jsonb;stamp timestamptz:=clock_timestamp();
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 p:=pg_temp.payment_test_row(a,'301');
 -- An identical ID in another Hotel is an independent source identity.
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at) values(tsk_run,actor,'TSK','1906-01-12','1906-01-12','backfill','synthetic-payment-proof','succeeded',false,stamp);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id) values('TSK',a,'Synthetic separate Hotel','SYNTHETIC_PAYMENT',stamp,tsk_run);
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('TSK',a,'301','1906-01-12',-100,70,30,jsonb_set(p,'{hotel}','"TSK"'),'observed',stamp,stamp,stamp,tsk_run);
 tsk_before:=(select to_jsonb(v) from ar_private.financial_payments v where hotel='TSK' and account_id=a);
 for n in 101..102 loop
  i:=pg_temp.payment_test_invoice(a,n::text);l:=pg_temp.payment_test_link(i,p);
  run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
  perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(l))));
  perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
  result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
  if result->>'complete' is distinct from 'true' or result->'summary'->>'amount' is distinct from '70.00' or result->'summary'->>'count' is distinct from '1' or result->'rows'->0->>'invoiceId' is distinct from n::text then raise exception 'reallocation retained old paid invoice: %',result;end if;
 end loop;
 if not exists(select 1 from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101' and source_status='not_observed') then raise exception 'superseded allocation not retired';end if;
 select first_observed_at into first_seen from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101';

 -- An already queued legacy worker can re-observe a payment after a v3 run.
 -- It resets the v3 flag to NULL; its historical guards retain their old behavior.
 i:=pg_temp.payment_test_invoice(a,'101','1906-01-12');l:=pg_temp.payment_test_link(i,p);
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 update ar_private.financial_runs set steps_version=2 where id=run;
 begin perform public.ar_financial_payment_prepare(actor,run,a);raise exception 'legacy run entered v3 phase';exception when others then if sqlerrm<>'financial_payment_version_invalid' then raise;end if;end;
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(l),'[]');
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 if not exists(select 1 from ar_private.financial_payments where hotel='KAT' and account_id=a and payment_mapping_verified is null)
  or not exists(select 1 from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101' and source_status='observed' and first_observed_at=first_seen)
  then raise exception 'legacy revival carried v3 proof or lost first observation';end if;
 if (select to_jsonb(v) from ar_private.financial_payments v where hotel='TSK' and account_id=a) is distinct from tsk_before then raise exception 'KAT publication touched matching TSK identity';end if;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-INVOICE-PROOF-'||gen_random_uuid();run uuid;p jsonb;i jsonb;l jsonb;result jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 p:=pg_temp.payment_test_row(a,'301');i:=pg_temp.payment_test_invoice(a,'101','1906-01-12');l:=pg_temp.payment_test_link(i,p);
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(l),'[]');
 perform public.ar_financial_payment_prepare(actor,run,a);perform public.ar_financial_payment_batch_save(actor,run,a,0,'[{"paymentId":"301","error":"financial_mapping_changed"}]');
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 -- Full INVOICE proof remains authoritative for the Applications report even
 -- when the independently attempted full PAYMENT proof is unknown.
 result:=public.ar_financial_report(actor,'applications','KAT',a,null,'1906-01-12','1906-01-12');
 if result->'summary'->>'amount' is distinct from '70.00' or result->'summary'->>'coverageComplete' is distinct from 'true'
  or result->'summary'->>'mappingVerified' is distinct from '1' or result->>'total' is distinct from '1'
  or not exists(select 1 from ar_private.financial_invoice_entries where hotel='KAT' and account_id=a and transaction_id='101' and mapping_verified)
  or not exists(select 1 from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101' and payment_id='301' and applied_amount=70 and source_status='observed') then raise exception 'failed payment suppressed independently proven invoice applications: %',result;end if;
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'false' or result->'summary'->'amount' is distinct from 'null'::jsonb
  or not exists(select 1 from ar_private.financial_payments where hotel='KAT' and account_id=a and transaction_id='301' and payment_mapping_verified is false) then raise exception 'invoice subset bypassed failed complete payment proof';end if;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-EXPIRY-'||gen_random_uuid();run uuid;next_run uuid;other_run uuid:=gen_random_uuid();p jsonb;input jsonb:='{"hotel":"KAT","reason":"backfill","from":"1906-01-12","to":"1906-01-12"}';other_before jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 p:=pg_temp.payment_test_row(a,'301','-100.00','0.00','100.00');
 -- A separate Hotel's pending work must not be affected by lease cleanup.
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,lease_until)
 values(other_run,actor,'TSK','1906-01-12','1906-01-12','backfill','synthetic-expiry-isolation','running',false,clock_timestamp()+interval '30 minutes');
 insert into ar_private.financial_run_accounts(run_id,account_id,ordinal,history_ready,payment_mapping_ready,payment_mapping_count) values(other_run,a,0,true,true,1);
 insert into ar_private.financial_payment_mapping_work(run_id,account_id,batch,payments) values(other_run,a,0,jsonb_build_array(jsonb_set(p,'{hotel}','"TSK"')));
 other_before:=(select to_jsonb(w) from ar_private.financial_payment_mapping_work w where run_id=other_run);

 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p,'invoices','[]'::jsonb,'links','[]'::jsonb)));
 update ar_private.financial_runs set lease_until=clock_timestamp()-interval '1 second' where id=run;
 -- If the surrounding request fails, both the status change and cleanup roll back.
 begin
  perform public.ar_financial_request(actor,gen_random_uuid(),input,'1906-01-12','1906-01-12','synthetic-payment-proof',null);
  raise exception 'invalid request accepted';
 exception when others then if sqlerrm<>'financial_invalid' then raise;end if;end;
 if not exists(select 1 from ar_private.financial_runs where id=run and status='running') or not exists(select 1 from ar_private.financial_payment_mapping_work where run_id=run and results is not null) then raise exception 'rolled-back expiry lost durable proof';end if;
 next_run:=(public.ar_financial_request(actor,gen_random_uuid(),input,'1906-01-12','1906-01-12','synthetic-payment-proof')->>'id')::uuid;
 if next_run=run or not exists(select 1 from ar_private.financial_runs where id=run and status='failed' and error_code='financial_lease_expired') or exists(select 1 from ar_private.financial_payment_mapping_work where run_id=run) then raise exception 'request expiry retained completed payment work';end if;

 -- Claiming a queued successor also expires an older run without the fail RPC.
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p));perform public.ar_financial_payment_prepare(actor,run,a);
 next_run:=(public.ar_financial_request(actor,gen_random_uuid(),input,'1906-01-12','1906-01-12','synthetic-payment-proof-queued')->>'id')::uuid;
 if next_run=run then raise exception 'expiry fixture did not queue a distinct successor';end if;
 update ar_private.financial_runs set lease_until=clock_timestamp()-interval '1 second' where id=run;
 if not public.ar_financial_claim(actor,next_run) then raise exception 'queued successor not claimed';end if;
 if not exists(select 1 from ar_private.financial_runs where id=run and status='failed' and error_code='financial_lease_expired') or exists(select 1 from ar_private.financial_payment_mapping_work where run_id=run) then raise exception 'claim expiry retained pending payment work';end if;
 if (select to_jsonb(w) from ar_private.financial_payment_mapping_work w where run_id=other_run) is distinct from other_before then raise exception 'expiry cleanup touched another run or Hotel';end if;
 if exists(select 1 from ar_private.financial_changes where account_id=a) or exists(select 1 from ar_private.financial_payments where account_id=a) then raise exception 'expiry cleanup published financial facts';end if;
 if has_function_privilege('service_role','ar_private.financial_payment_failed_cleanup()','execute') or has_function_privilege('authenticated','ar_private.financial_payment_failed_cleanup()','execute') then raise exception 'failure cleanup helper exposed';end if;
 perform public.ar_financial_fail(actor,next_run,'financial_payment_cancelled');perform public.ar_financial_fail(actor,other_run,'financial_payment_cancelled');
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-PERIOD-ISOLATION-'||gen_random_uuid();legacy_run uuid;run uuid;i jsonb;p10 jsonb;p11 jsonb;l10 jsonb;l11 jsonb;coverage jsonb;before_paid jsonb;after_paid jsonb;before_link jsonb;before_payment jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 i:=pg_temp.payment_test_invoice(a,'101','1905-12-01','100.00','100.00','0.00');
 p10:=pg_temp.payment_test_row(a,'301','-30.00','30.00','0.00')||'{"transactionDate":"1906-01-10","postingDate":"1906-01-10"}';
 p11:=pg_temp.payment_test_row(a,'302','-70.00','70.00','0.00')||'{"transactionDate":"1906-01-11","postingDate":"1906-01-11"}';
 l10:=pg_temp.payment_test_link(i,p10,'30.00');l11:=pg_temp.payment_test_link(i,p11,'70.00');
 legacy_run:=(public.ar_financial_request(actor,gen_random_uuid(),'{"hotel":"KAT","reason":"backfill","from":"1905-12-01","to":"1906-01-11"}','1905-12-01','1906-01-11','synthetic-period-isolation')->>'id')::uuid;
 update ar_private.financial_runs set steps_version=2 where id=legacy_run;
 perform public.ar_financial_claim(actor,legacy_run);perform public.ar_financial_discovery_set(actor,legacy_run,array[a]);
 perform public.ar_financial_stage_batch(actor,legacy_run,a,'invoice',0,jsonb_build_array(i));perform public.ar_financial_stage_batch(actor,legacy_run,a,'payment',0,jsonb_build_array(p10,p11));
 coverage:=jsonb_build_object('query',jsonb_build_object('hotel','KAT','accountId',a,'start','1905-12-01','end','1906-01-11','kinds','["invoice","payment"]'::jsonb),'observedAt',clock_timestamp(),'pagination','complete','pages',1,'members',3,'roots',3,'reportedRoots',3,
  'dateSemantics','unverified','financialClassification','unverified','completeForFinancialPeriod',false,'missingTransactionDates',0,'outsideRequestedTransactionDates',0,'unknownPrimaryAmounts',0);
 perform public.ar_financial_history_ready(actor,legacy_run,a,'{"name":"Synthetic shared invoice","type":"SYNTHETIC_PAYMENT","accountNo":null}',coverage);
 perform public.ar_financial_mapping_batch_save(actor,legacy_run,a,0,array['101'],array['101'],jsonb_build_array(l10,l11),'[]');
 perform public.ar_financial_history_finalize(actor,legacy_run,a);perform public.ar_financial_publish(actor,legacy_run,array[a]);
 before_paid:=public.ar_dashboard_payment_invoices(actor,'1906-01-10','1906-01-10','KAT',a);
 before_link:=(select to_jsonb(v) from ar_private.financial_applications v where hotel='KAT' and account_id=a and payment_id='301');
 before_payment:=(select to_jsonb(v) from ar_private.financial_payments v where hotel='KAT' and account_id=a and transaction_id='301');
 if before_paid->>'complete' is distinct from 'true' or before_paid->'summary'->>'amount' is distinct from '30.00' then raise exception 'period isolation setup did not prove Payment10';end if;

 -- This run reads Payment11 only. Its older invoice is context, not a new
 -- full-invoice mapping attempt and not evidence about Payment10's allocation.
 run:=(public.ar_financial_request(actor,gen_random_uuid(),'{"hotel":"KAT","reason":"backfill","from":"1906-01-11","to":"1906-01-11"}','1906-01-11','1906-01-11','synthetic-period-isolation')->>'id')::uuid;
 perform public.ar_financial_claim(actor,run);perform public.ar_financial_discovery_set(actor,run,array[a]);perform public.ar_financial_stage_batch(actor,run,a,'payment',0,jsonb_build_array(p11));
 coverage:=jsonb_set(coverage,'{query,start}','"1906-01-11"')||'{"members":1,"roots":1,"reportedRoots":1}';
 perform public.ar_financial_history_ready(actor,run,a,'{"name":"Synthetic shared invoice","type":"SYNTHETIC_PAYMENT","accountNo":null}',coverage);
 perform public.ar_financial_payment_prepare(actor,run,a);perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p11,'invoices',jsonb_build_array(i),'links',jsonb_build_array(l11))));
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 after_paid:=public.ar_dashboard_payment_invoices(actor,'1906-01-10','1906-01-10','KAT',a);
 if after_paid->>'complete' is distinct from 'true' or after_paid->'summary'->>'amount' is distinct from '30.00'
  or (select to_jsonb(v) from ar_private.financial_applications v where hotel='KAT' and account_id=a and payment_id='301') is distinct from before_link
  or (select to_jsonb(v) from ar_private.financial_payments v where hotel='KAT' and account_id=a and transaction_id='301') is distinct from before_payment
  then raise exception 'cross-period invalidation: before complete %, amount %; after complete %, amount %; prior link status %, invoice mapping verified %',before_paid->>'complete',before_paid->'summary'->>'amount',after_paid->>'complete',after_paid->'summary'->>'amount',
   (select source_status from ar_private.financial_applications where hotel='KAT' and account_id=a and payment_id='301'),(select mapping_verified from ar_private.financial_invoice_entries where hotel='KAT' and account_id=a and transaction_id='101');end if;
 after_paid:=public.ar_dashboard_payment_invoices(actor,'1906-01-11','1906-01-11','KAT',a);
 if after_paid->>'complete' is distinct from 'true' or after_paid->'summary'->>'amount' is distinct from '70.00' then raise exception 'scoped Payment11 proof was lost';end if;
 if not exists(select 1 from ar_private.financial_invoice_entries where hotel='KAT' and account_id=a and transaction_id='101' and not mapping_verified) then raise exception 'payment context became complete invoice proof';end if;

 -- An actual dated INVOICE mapping failure still invalidates that invoice's
 -- previous applications; it must not be mistaken for a context-only lookup.
 run:=(public.ar_financial_request(actor,gen_random_uuid(),'{"hotel":"KAT","reason":"backfill","from":"1905-12-01","to":"1905-12-01"}','1905-12-01','1905-12-01','synthetic-period-isolation')->>'id')::uuid;
 perform public.ar_financial_claim(actor,run);perform public.ar_financial_discovery_set(actor,run,array[a]);perform public.ar_financial_stage_batch(actor,run,a,'invoice',0,jsonb_build_array(i));
 coverage:=jsonb_set(jsonb_set(coverage,'{query,start}','"1905-12-01"'),'{query,end}','"1905-12-01"');
 perform public.ar_financial_history_ready(actor,run,a,'{"name":"Synthetic shared invoice","type":"SYNTHETIC_PAYMENT","accountNo":null}',coverage);
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],'{}','[]','[{"invoiceId":"101","code":"financial_mapping_changed"}]');
 perform public.ar_financial_payment_prepare(actor,run,a);perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 after_paid:=public.ar_dashboard_payment_invoices(actor,'1906-01-10','1906-01-10','KAT',a);
 if after_paid->>'complete' is distinct from 'false' or after_paid->'summary'->'amount' is distinct from 'null'::jsonb
  or not exists(select 1 from ar_private.financial_applications where hotel='KAT' and account_id=a and payment_id='301' and source_status='not_observed') then raise exception 'explicit invoice mapping failure stopped invalidating unknown allocations';end if;
end$$;

do $$
declare actor uuid;a text:='SYNTHETIC-PAYMENT-DATE-MERGE-'||gen_random_uuid();run uuid;p jsonb;i jsonb;invoice_link jsonb;payment_link jsonb;result jsonb;prior_source jsonb;prior_publications bigint;field_name text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 p:=pg_temp.payment_test_row(a,'301');i:=pg_temp.payment_test_invoice(a,'101','1906-01-12')||'{"postingDate":null,"closeDate":"1906-01-12"}';
 payment_link:=pg_temp.payment_test_link(i,p);invoice_link:=payment_link||'{"invoicePostingDate":"1906-01-12","invoiceCloseDate":null}';
 run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
 perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(invoice_link),'[]');
 perform public.ar_financial_payment_prepare(actor,run,a);
 perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(payment_link))));
 perform public.ar_financial_history_finalize(actor,run,a);perform public.ar_financial_publish(actor,run,array[a]);
 prior_source:=(select source_data from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101' and payment_id='301');
 if prior_source is distinct from (payment_link||'{"invoicePostingDate":"1906-01-12"}') or (select count(*) from ar_private.financial_changes where run_id=run and account_id=a and kind='application')<>1 then raise exception 'complementary optional dates were discarded or duplicated';end if;
 result:=public.ar_dashboard_payment_invoices(actor,'1906-01-12','1906-01-12','KAT',a);
 if result->>'complete' is distinct from 'true' or result->'summary'->>'amount' is distinct from '70.00' then raise exception 'compatible optional dates blocked verified payment';end if;
 result:=public.ar_financial_report(actor,'applications','KAT',a,null,'1906-01-12','1906-01-12');
 if result->'summary'->>'amount' is distinct from '70.00' or result->'summary'->>'coverageComplete' is distinct from 'true' then raise exception 'compatible dates changed independent invoice proof';end if;

 -- Known/known contradictions must still abort atomically for either optional date.
 for field_name in select unnest(array['invoicePostingDate','invoiceCloseDate']) loop
  i:=pg_temp.payment_test_invoice(a,'101','1906-01-12')||'{"closeDate":"1906-01-12"}';
  payment_link:=pg_temp.payment_test_link(i,p);invoice_link:=jsonb_set(payment_link,array[field_name],'"1906-01-13"');
  select count(*) into prior_publications from ar_private.financial_publications;
  run:=pg_temp.payment_test_start(actor,a,jsonb_build_array(p),jsonb_build_array(i));
  perform public.ar_financial_mapping_batch_save(actor,run,a,0,array['101'],array['101'],jsonb_build_array(invoice_link),'[]');
  perform public.ar_financial_payment_prepare(actor,run,a);
  perform public.ar_financial_payment_batch_save(actor,run,a,0,jsonb_build_array(jsonb_build_object('payment',p,'invoices',jsonb_build_array(i),'links',jsonb_build_array(payment_link))));
  perform public.ar_financial_history_finalize(actor,run,a);
  begin perform public.ar_financial_publish(actor,run,array[a]);raise exception 'known optional date contradiction accepted';exception when others then if sqlerrm<>'financial_payment_observation_conflict' then raise;end if;end;
  if (select count(*) from ar_private.financial_publications)<>prior_publications or exists(select 1 from ar_private.financial_changes where run_id=run)
   or (select source_data from ar_private.financial_applications where hotel='KAT' and account_id=a and invoice_id='101' and payment_id='301') is distinct from prior_source then raise exception 'date contradiction changed published facts';end if;
  perform public.ar_financial_fail(actor,run,'financial_payment_observation_conflict');
 end loop;
 if ar_private.financial_application_compatible(payment_link,jsonb_set(payment_link,'{invoiceTransactionDate}','"1906-01-13"'))
  or ar_private.financial_application_compatible(payment_link,jsonb_set(payment_link,'{appliedAmount}','"-70.00"'))
  or ar_private.financial_application_compatible(payment_link,jsonb_set(payment_link,'{paymentTransactionId}','"302"'))
  or ar_private.financial_application_compatible(payment_link,jsonb_set(payment_link,'{currency}','"USD"')) then raise exception 'optional-date compatibility relaxed primary source facts';end if;
 if has_function_privilege('service_role','ar_private.financial_application_compatible(jsonb,jsonb)','execute') or has_function_privilege('authenticated','ar_private.financial_application_publication_rows(uuid)','execute') then raise exception 'application merge helper exposed';end if;
end$$;

rollback;
select 'Payment date scoped proof, older Bill Date, freshness, explicit retirement, atomic publication, signs, failures, batching and ACL checks passed; rolled back' as result;
