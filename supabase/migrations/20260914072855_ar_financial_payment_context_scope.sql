-- A PAYMENT lookup may refresh an older invoice as context without attempting
-- that invoice's complete allocation mapping. Context-only mapping_verified=false
-- must not retire another payment's independently observed links.
-- Preserve the original v1/v2 behavior and every successful-payment retirement,
-- source absence, classification, identity, monetary and freshness guard.
do $migration$
declare definition text;needle text;replacement text;
begin
 definition:=replace(pg_get_functiondef('ar_private.financial_publish_before_granular_cleanup(uuid,uuid,text[])'::regprocedure),E'\r','');
 needle:=$needle$and not i.mapping_verified and a.source_status='observed'$needle$;
 replacement:=$replacement$and not i.mapping_verified and a.source_status='observed'
   and exists(select 1 from ar_private.financial_runs run_scope where run_scope.id=p_run_id
    and (run_scope.steps_version<>3 or exists(
     select 1 from ar_private.financial_run_accounts account_scope
     cross join lateral jsonb_array_elements(coalesce(account_scope.coverage->'mappingFailures','[]'::jsonb)) failure
     where account_scope.run_id=p_run_id and account_scope.account_id=i.account_id
      and failure->>'invoiceId'=i.transaction_id
    )))$replacement$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'review current payment context invalidation scope';end if;
 execute replace(definition,needle,replace(replacement,E'\r',''));
end $migration$;

-- The two independently verified endpoints may complement each other's optional
-- posting/close dates. NULL is unknown only for these two fields; every identity,
-- Bill Date, amount, sign, currency and other source fact must still match exactly.
create function ar_private.financial_application_compatible(left_row jsonb,right_row jsonb) returns boolean
 language sql immutable strict set search_path='' as $$
 select left_row-array['invoicePostingDate','invoiceCloseDate']=right_row-array['invoicePostingDate','invoiceCloseDate']
  and (left_row->>'invoicePostingDate' is null or right_row->>'invoicePostingDate' is null or left_row->'invoicePostingDate'=right_row->'invoicePostingDate')
  and (left_row->>'invoiceCloseDate' is null or right_row->>'invoiceCloseDate' is null or left_row->'invoiceCloseDate'=right_row->'invoiceCloseDate');
$$;

create function ar_private.financial_application_publication_rows(p_run uuid) returns table(account_id text,v jsonb)
 language plpgsql stable set search_path='' as $$
begin
 -- Check before aggregation: neither a conflicting amount nor a conflicting
 -- known optional date may be hidden by choosing one observation arbitrarily.
 if exists(select 1 from(
   select b.account_id,link.v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)link(v) where b.run_id=p_run and b.kind='application'
   union all select o.account_id,o.v from ar_private.financial_payment_observations(p_run,'application')o
  )source_rows group by source_rows.account_id,source_rows.v->>'invoiceTransactionId',source_rows.v->>'paymentTransactionId'
  having count(distinct(source_rows.v-array['invoicePostingDate','invoiceCloseDate']))>1
   or count(distinct(source_rows.v->>'invoicePostingDate'))>1 or count(distinct(source_rows.v->>'invoiceCloseDate'))>1)
  then raise exception 'financial_payment_observation_conflict';end if;
 return query select source_rows.account_id,(source_rows.v-array['invoicePostingDate','invoiceCloseDate'])
  ||jsonb_build_object('invoicePostingDate',max(source_rows.v->>'invoicePostingDate'),'invoiceCloseDate',max(source_rows.v->>'invoiceCloseDate'))
 from(
  select b.account_id,link.v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)link(v) where b.run_id=p_run and b.kind='application'
  union all select o.account_id,o.v from ar_private.financial_payment_observations(p_run,'application')o
 )source_rows group by source_rows.account_id,source_rows.v-array['invoicePostingDate','invoiceCloseDate'];
end$$;
revoke all on function ar_private.financial_application_compatible(jsonb,jsonb),ar_private.financial_application_publication_rows(uuid) from public,anon,authenticated,service_role;

do $migration$
declare definition text;needle text;replacement text;change record;
begin
 definition:=replace(pg_get_functiondef('ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[])'::regprocedure),E'\r','');
 needle:=replace($needle$select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='application'
    union all select account_id,v from ar_private.financial_payment_observations(p_run_id,'application') where r.steps_version=3$needle$,E'\r','');
 replacement:=replace($replacement$select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='application' and r.steps_version<>3
    union all select account_id,v from ar_private.financial_application_publication_rows(p_run_id) where r.steps_version=3$replacement$,E'\r','');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'review current application publication merge';end if;
 execute replace(definition,needle,replacement);

 definition:=replace(pg_get_functiondef('public.ar_financial_publish(uuid,uuid,text[])'::regprocedure),E'\r','');
 for change in select * from(values
  ($needle$group by account_id,v->>'invoiceTransactionId',v->>'paymentTransactionId' having count(distinct v)>1$needle$,
   $replacement$group by account_id,v->>'invoiceTransactionId',v->>'paymentTransactionId'
    having count(distinct(v-array['invoicePostingDate','invoiceCloseDate']))>1
     or count(distinct(v->>'invoicePostingDate'))>1 or count(distinct(v->>'invoiceCloseDate'))>1$replacement$),
  ($needle$where o.account_id=b.account_id and o.v=v$needle$,
   $replacement$where o.account_id=b.account_id and ar_private.financial_application_compatible(o.v,v)$replacement$)
 )x(old_text,new_text) loop
  needle:=replace(change.old_text,E'\r','');replacement:=replace(change.new_text,E'\r','');
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'review current application publication proof comparison';end if;
  definition:=replace(definition,needle,replacement);
 end loop;
 execute definition;
end $migration$;
