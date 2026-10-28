-- Recover existing confirmed-Sent date work through the normal validated sync.
-- No provider call, mail action or business date backfill is performed here.
do $patch$
declare definition text; old_text text; new_text text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure),chr(13),'');
 old_text:='p_region=''khao-lak'' and q.state=''uncertain'' or q.authority_generation=';
 new_text:='p_region=''khao-lak'' and q.state=''uncertain'' or p_region=''phuket'' and q.state in(''uncertain'',''conflict'') and r.sheet_values->q.field=q.desired_value or q.authority_generation=';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'phuket_echo_projection_drift';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='q.state in(''pending'',''uncertain'',''held'')';
 new_text:='(q.state in(''pending'',''uncertain'',''held'') or p_region=''phuket'' and q.state=''conflict'')';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'phuket_retry_projection_drift';end if;
 execute replace(definition,old_text,new_text);

 definition:=replace(pg_get_functiondef('public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text)'::regprocedure),chr(13),'');
 old_text:=$old$ if q.state<>'uncertain' and q.authority_generation<>coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0) then
  update ar_private.tracker_outbox set state='suppressed',updated_at=now() where id=q.id;return jsonb_build_object('state','suppressed');
 end if;
 select * into r from ar_private.tracker_rows where region=p_region and hotel=q.hotel and account_id=q.account_id and invoice_id=q.invoice_id and present for update;$old$;
 new_text:=$new$ select * into r from ar_private.tracker_rows where region=p_region and hotel=q.hotel and account_id=q.account_id and invoice_id=q.invoice_id and present for update;
 -- An exact source echo can acknowledge an older attempted upload. Recheck
 -- under the existing row lock: a newer edit or deletion wins over a late receipt.
 if q.authority_generation<>coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0)
 and (q.state<>'uncertain' or p_region='phuket')
 and not coalesce(p_region='phuket' and q.state in('uncertain','conflict') and p_state='written'
  and r.sheet_values->q.field=p_value and exists(select 1 from ar_private.tracker_current_dates c
   where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)
   and to_jsonb(c.actual_date)=p_value),false) then
  update ar_private.tracker_outbox set state='suppressed',updated_at=now() where id=q.id;return jsonb_build_object('state','suppressed');
 end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'phuket_receipt_generation_drift';end if;
 execute replace(definition,old_text,new_text);

 definition:=replace(pg_get_functiondef('public.ar_tracker_status(uuid,text)'::regprocedure),chr(13),'');
 old_text:=$old$(select count(*) from ar_private.tracker_outbox where owner=o and state in('pending','uncertain') and hotel=any(ar_private.access_hotels(array[p_region])))$old$;
 new_text:=$new$(select count(*) from ar_private.tracker_outbox q where q.owner=o and q.hotel=any(ar_private.access_hotels(array[p_region]))
 and (q.state in('pending','uncertain') or p_region='phuket' and q.state='conflict' and exists(
  select 1 from ar_private.tracker_rows r where r.region=p_region and r.hotel=q.hotel and r.account_id=q.account_id and r.invoice_id=q.invoice_id and r.present
  and (q.authority_generation=coalesce((select c.generation from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(q.hotel,q.account_id,q.invoice_id,q.field)),0) or r.sheet_values->q.field=q.desired_value)
  and (select count(*) from ar_private.tracker_rows mapped where mapped.region=p_region and mapped.hotel=q.hotel and mapped.account_id=q.account_id and mapped.invoice_id=q.invoice_id and mapped.present)=1
  and not exists(select 1 from ar_private.tracker_conflicts c where c.region=r.region and c.row_key=r.row_key and c.status='pending' and c.field in(q.field,'identity')))))$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'phuket_retry_status_drift';end if;
 execute replace(definition,old_text,new_text);
end$patch$;
