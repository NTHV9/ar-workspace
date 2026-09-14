-- The current Account reader excludes compressed child rows. Permit only its
-- exact invoice filter in the isolated gateway; other table/role/value inputs
-- retain the existing rejection. No business reader or grants are changed.
do $$declare definition text;needle text;replacement text;occurrences integer;begin
 definition:=pg_get_functiondef('public.ar_acceptance_read(uuid,uuid,text,jsonb,integer,integer)'::regprocedure);
 needle:=$needle$if pair.key not in('hotel','account_id','id','owner','open') or pair.value!~'^(eq|neq)[.]' then return jsonb_build_object('error','acceptance_filter_invalid');end if;$needle$;
 replacement:=$replacement$if pair.key='collection_role' then
   if p_table is distinct from 'ar_invoices' or pair.value is distinct from 'neq.child' then return jsonb_build_object('error','acceptance_filter_invalid');end if;
  elsif pair.key not in('hotel','account_id','id','owner','open') or pair.value!~'^(eq|neq)[.]' then return jsonb_build_object('error','acceptance_filter_invalid');end if;$replacement$;
 occurrences:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
 if occurrences<>1 then raise exception 'acceptance_read_definition_changed';end if;
 execute replace(definition,needle,replacement);
end$$;
