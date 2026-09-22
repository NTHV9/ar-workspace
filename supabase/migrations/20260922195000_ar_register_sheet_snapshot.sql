-- Each bounded page carries a signature of the complete filtered result.
-- The continuous sheet retries if refresh, manual edits or personal visibility
-- changed between pages. The signature contains no customer-readable values.
do $$
declare definition text;needle text:=$needle$'total',(select count(*) from matched)$needle$;
begin
 definition:=pg_get_functiondef('public.ar_invoice_register_read(uuid,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'register_sheet_definition_drift';end if;
 execute replace(definition,needle,needle||$replacement$,'snapshot',(select md5(coalesce(string_agg(md5(to_jsonb(m)::text),'' order by m.hotel,m.account_id,m.id),'')) from matched m)$replacement$);
end $$;
