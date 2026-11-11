-- A later Account transfer cannot race an unresolved earlier publication for
-- the same logical invoice, even when OPERA has assigned a new transaction ID.
do $patch$
declare definition text;needle text:=' and ar_private.tracker_source_eligible(r.hotel,r.account_id,r.invoice_id)';
begin
 definition:=replace(pg_get_functiondef('ar_private.tracker_transfer_candidates(text)'::regprocedure),chr(13),'');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_transfer_uncertain_fence_drift';end if;
 execute replace(definition,needle,needle||$replacement$
 and not exists(select 1 from ar_private.tracker_transfer_writes prior
  where prior.region=r.region and prior.hotel=r.hotel and prior.state='uncertain' and prior.transfer_id<>t.id
   and (prior.old_identity->>'invoiceNo',prior.old_identity->>'folio',prior.old_identity->>'transactionDate')=
       (r.identity->>'invoiceNo',r.identity->>'folio',r.identity->>'transactionDate'))$replacement$);
end $patch$;
