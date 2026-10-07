-- Native best-effort publication can be unknown. Preserve the attempted values
-- and fence all same-field siblings globally, rather than automatically retry.
create index tracker_outbox_unknown_field on ar_private.tracker_outbox(owner,hotel,account_id,invoice_id,field) where state='uncertain';
do $$declare definition text;needle text;replacement text;begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure),E'\r','');
 needle:=$needle$r.sheet_values->q.field as expected,$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_preimage_drift';end if;
 definition:=replace(definition,needle,$replacement$case when p_region='khao-lak' and q.state='uncertain' then q.expected_value else r.sheet_values->q.field end as expected,$replacement$);
 needle:=$needle$to_jsonb(case when q.field='R' then w.first_billing_date$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_value_start_drift';end if;
 definition:=replace(definition,needle,$replacement$case when p_region='khao-lak' and q.state='uncertain' then q.desired_value else to_jsonb(case when q.field='R' then w.first_billing_date$replacement$);
 needle:=$needle$end) as value,q.state$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_value_end_drift';end if;
 definition:=replace(definition,needle,'end) end as value,q.state');
 needle:=$needle$and q.state in('pending','uncertain','held')$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_sibling_fence_drift';end if;
 definition:=replace(definition,needle,$replacement$and q.state in('pending','uncertain','held') and (p_region<>'khao-lak' or q.state='uncertain' or not exists(select 1 from ar_private.tracker_outbox unknown_intent where unknown_intent.owner=q.owner and unknown_intent.hotel=q.hotel and unknown_intent.account_id=q.account_id and unknown_intent.invoice_id=q.invoice_id and unknown_intent.field=q.field and unknown_intent.state='uncertain'))$replacement$);
 execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_write_result(uuid,text,uuid,uuid,text,jsonb,jsonb,text)'::regprocedure),E'\r','');
 needle:=$needle$expected_value=p_expected,desired_value=p_value$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_rearm_drift';end if;
 definition:=replace(definition,needle,$replacement$expected_value=case when p_region='khao-lak' and q.state='uncertain' and p_state='uncertain' then q.expected_value else p_expected end,desired_value=case when p_region='khao-lak' and q.state='uncertain' and p_state='uncertain' then q.desired_value else p_value end$replacement$);
 needle:=$needle$attempts=attempts+case when p_state='held' then 0 else 1 end$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_native_unknown_read_touch_drift';end if;
 definition:=replace(definition,needle,$replacement$attempts=attempts+case when p_state='held' or p_region='khao-lak' and q.state='uncertain' and p_state='uncertain' then 0 else 1 end$replacement$);
 execute definition;
end $$;
