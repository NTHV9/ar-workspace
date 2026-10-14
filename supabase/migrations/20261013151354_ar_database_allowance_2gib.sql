do $$ declare definition text; begin
 definition:=pg_get_functiondef('ar_private.operations_budget_limits(jsonb)'::regprocedure);
 if position('when ''databaseBytes'' then 1073741824' in definition)=0 then raise exception 'database_allowance_definition_drift';end if;
 execute replace(definition,'when ''databaseBytes'' then 1073741824','when ''databaseBytes'' then 2147483648');
 if not ar_private.operations_budget_limits('{"storedBytes":1073741824,"egressBytes":2147483648,"databaseBytes":2147483648,"safetyPercent":20,"maxConcurrent":4,"measurementMaxAgeSeconds":300}'::jsonb) then raise exception 'database_allowance_validation_failed';end if;
 if ar_private.operations_budget_limits('{"storedBytes":1073741824,"egressBytes":2147483648,"databaseBytes":2147483649,"safetyPercent":20,"maxConcurrent":4,"measurementMaxAgeSeconds":300}'::jsonb) then raise exception 'database_allowance_upper_bound_failed';end if;
end $$;
