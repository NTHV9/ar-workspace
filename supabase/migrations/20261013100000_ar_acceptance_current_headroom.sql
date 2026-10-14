-- Acceptance remains disabled. This updates only the admin-only provisioner.
-- Match the existing 1 GiB application DB allowance with its 20% reserve,
-- retaining the separate 24 MiB scenario reservation. No plan/capacity change.
do $migration$
declare definition text;
 needle text := 'if pg_database_size(current_database())>104857600 then raise exception ''acceptance_database_headroom_required'';end if;';
 replacement text := 'if pg_database_size(current_database())+25165824>858993459 then raise exception ''acceptance_database_headroom_required'';end if;';
begin
 definition:=pg_get_functiondef('ar_private.acceptance_admin_provision(uuid,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
  raise exception 'acceptance_provision_definition_changed';
 end if;
 definition:=replace(definition,needle,replacement);
 needle:='select hotel,version,active,''{}''::jsonb from ar_private.statement_templates where active;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'acceptance_template_definition_changed';end if;
 definition:=replace(definition,needle,needle||E'\ninsert into ar_acceptance_private_20260911.invoice_templates(hotel,version,active,assets) select hotel,version,active,''{}''::jsonb from ar_private.invoice_templates where active;');
 needle:='''statement_templates'',''dashboard_capture_state''';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'acceptance_seed_validation_changed';end if;
 definition:=replace(definition,needle,'''statement_templates'',''invoice_templates'',''dashboard_capture_state''');
 execute definition;
end
$migration$;
revoke all on function ar_private.acceptance_admin_provision(uuid,uuid) from public,anon,authenticated,service_role;
