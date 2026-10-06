-- An identifiable row is not necessarily an eligible invoice. Match the existing
-- Register source guard before preview approval and again inside atomic import.
create function ar_private.tracker_source_eligible(p_hotel text,p_account text,p_invoice text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account and i.id=p_invoice
 and i.verification_state in('verified','cleared') and i.collection_role in('standalone','parent') and i.parent_invoice_id is null);
$$;
revoke all on function ar_private.tracker_source_eligible(text,text,text) from public,anon,authenticated,service_role;

do $$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_preview(uuid,text,text,text,text,jsonb)'::regprocedure),E'\r','');
 needle:=$needle$if match_count<>1 or r->>'ambiguous'='true' or r->>'holdReason' is not null then held:=held+1;review_rows:=review_rows||jsonb_build_array(r);continue;end if;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_preview_eligibility_definition_drift';end if;
 definition:=replace(definition,needle,$replacement$if match_count<>1 or r->>'ambiguous'='true' or r->>'holdReason' is not null then held:=held+1;review_rows:=review_rows||jsonb_build_array(r);continue;end if;
  if not ar_private.tracker_source_eligible(r->>'hotel',a,i) then held:=held+1;review_rows:=review_rows||jsonb_build_array(r||jsonb_build_object('holdReason','invoice_source_unverified'));continue;end if;$replacement$);
 -- JSONB concatenation recopies the whole growing preview for every input row.
 -- PL/pgSQL's expanded array accumulator retains ordering and converts once.
 needle:='review_rows jsonb:=''[]''';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_preview_array_definition_drift';end if;
 definition:=replace(definition,needle,'review_rows jsonb[]:=''{}''::jsonb[]');
 definition:=replace(definition,'review_rows:=review_rows||jsonb_build_array(r);','review_rows:=array_append(review_rows,r);');
 definition:=replace(definition,'review_rows:=review_rows||jsonb_build_array(r||jsonb_build_object(''holdReason'',''invoice_source_unverified''));','review_rows:=array_append(review_rows,r||jsonb_build_object(''holdReason'',''invoice_source_unverified''));');
 definition:=replace(definition,'review_rows:=review_rows||jsonb_build_array(r||jsonb_build_object(''reviewFence'',fence));','review_rows:=array_append(review_rows,r||jsonb_build_object(''reviewFence'',fence));');
 needle:='p_hash,review_rows)';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_preview_array_store_definition_drift';end if;
 definition:=replace(definition,needle,'p_hash,to_jsonb(review_rows))');
 execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),E'\r','');
 needle:=$needle$select * into old from ar_private.tracker_rows where region=p_region and row_key=r->>'rowKey' for update;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_eligibility_definition_drift';end if;
 definition:=replace(definition,needle,$replacement$if match_count=1 and not ar_private.tracker_source_eligible(r->>'hotel',a,i) then r:=r||jsonb_build_object('holdReason','invoice_source_unverified');end if;
  select * into old from ar_private.tracker_rows where region=p_region and row_key=r->>'rowKey' for update;$replacement$);
 needle:=$needle$select * into w from public.ar_invoice_workflow where hotel=r->>'hotel' and account_id=a and invoice_id=i for update;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_verified_definition_drift';end if;
 definition:=replace(definition,needle,$replacement$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='invoice_source_unverified' and status='pending';
  select * into w from public.ar_invoice_workflow where hotel=r->>'hotel' and account_id=a and invoice_id=i for update;$replacement$);
 execute definition;
end $$;
