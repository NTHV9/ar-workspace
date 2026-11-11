-- Keep costly source/policy verification behind the latest actual Account
-- reassignment. Otherwise the planner may repeat policy matching for every
-- account/invoice join before rejecting rows that have never transferred.
do $patch$
declare definition text; source_needle text:=' from ar_private.tracker_rows r'; cte_needle text:=' with candidates as(';
begin
 definition:=replace(pg_get_functiondef('ar_private.tracker_transfer_candidates(text)'::regprocedure),chr(13),'');
 if (length(definition)-length(replace(definition,source_needle,'')))/length(source_needle)<>1
 or (length(definition)-length(replace(definition,cte_needle,'')))/length(cte_needle)<>1 then
  raise exception 'tracker_transfer_candidate_scope_drift';
 end if;
 definition:=replace(definition,source_needle,' from transferred_rows r');
 execute replace(definition,cte_needle,$replacement$
 with transferred_rows as materialized(
 select r.* from ar_private.tracker_rows r
 join lateral(select x.* from ar_private.tracker_identity_transfers x where x.region=r.region and x.row_key=r.row_key order by x.id desc limit 1)t on true
 where r.region=p_region and r.present and r.policy_identity_verified
 and t.old_account is distinct from t.new_account
 and (t.new_hotel,t.new_account,t.new_invoice)=(r.hotel,r.account_id,r.invoice_id)
 and (t.new_identity->>'agent',t.new_identity->>'accountNo')=(r.identity->>'agent',r.identity->>'accountNo')
 ),candidates as($replacement$);
end $patch$;
