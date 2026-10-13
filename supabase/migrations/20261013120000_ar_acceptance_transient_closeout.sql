-- A transient PDF/mail scenario does not create a Drive archive. Require a
-- deleted Drive-file receipt only when archive/legacy work was actually used.
-- The existing closeout still checks every Storage/retention item, outstanding
-- work, and the exact owned Drive folder's emptiness before removing containers.
do $migration$
declare definition text;
 needle text := 'not exists(select 1 from ar_acceptance_private_20260911.retention_items where store=''drive'' and state=''deleted'')';
 replacement text := '(exists(select 1 from ar_acceptance_20260911.ar_document_jobs where lifecycle=''legacy'') or exists(select 1 from ar_acceptance_private_20260911.drive_archive_files)) and not exists(select 1 from ar_acceptance_private_20260911.retention_items where store=''drive'' and state=''deleted'')';
begin
 definition:=pg_get_functiondef('public.ar_acceptance_close_begin(uuid,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'acceptance_closeout_definition_changed';end if;
 execute replace(definition,needle,replacement);
end
$migration$;
