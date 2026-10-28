-- Aging read projection only. Keep historical lineage and source money untouched.
-- Missing old children can stop blocking counts only when the current root set
-- reconciles exactly with every native account Aging bucket.
do $patch$
declare definition text; old_text text; new_text text;
begin
 definition:=replace(pg_get_functiondef('public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)'::regprocedure),chr(13),'');
 old_text:=$old$ ),false) as child,
 null::bigint as matches,null::jsonb as bucket$old$;
 new_text:=$new$ ),false) as verified_child,
 coalesce(i.collection_role='child' and i.verification_state='missing'
  and a.verification_state='verified' and i.synced_at<a.synced_at
  and i.parent_open=0 and i.compressed=false
  and nullif(btrim(i.parent_invoice_id),'') is not null and i.parent_invoice_id<>i.id
  and nullif(btrim(i.parent_invoice_no),'') is not null
  and not exists(select 1 from public.ar_invoices par where par.hotel=i.hotel and par.account_id=i.account_id
   and (par.id=i.parent_invoice_id or par.invoice_no=i.parent_invoice_no)),false) as historical_child,
 null::bigint as matches,null::jsonb as bucket$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'aging_historical_child_projection_drift';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='and not bad.child and not(bad.verification_state';
 new_text:='and not bad.verified_child and not bad.historical_child and not(bad.verification_state';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'aging_historical_child_membership_drift';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='source as materialized(select s.*,case when m.resolution';
 new_text:='source as materialized(select s.*,(s.verified_child or s.historical_child and m.resolution->>''state''=''resolved'') as child,case when m.resolution';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'aging_historical_child_resolution_drift';end if;
 execute replace(definition,old_text,new_text);
end$patch$;
