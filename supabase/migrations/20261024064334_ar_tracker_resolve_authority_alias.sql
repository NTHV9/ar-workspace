-- The resolver declares c as tracker_conflicts; an inner SQL alias named c
-- resolves against that PL/pgSQL record and has no hotel/account identity fields.
-- Preserve the generation fence, existing function attributes and grants.
do $migration$
declare definition text;needle text;replacement text;before_acl aclitem[];after_acl aclitem[];before_security boolean;after_security boolean;before_config text[];after_config text[];
begin
 select proacl,prosecdef,proconfig into before_acl,before_security,before_config from pg_proc where oid='public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure;
 definition:=replace(pg_get_functiondef('public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure),chr(13),'');
 needle:='not exists(select 1 from ar_private.tracker_current_dates c where (c.hotel,c.account_id,c.invoice_id,c.field)=(r.hotel,r.account_id,r.invoice_id,ar_private.tracker_outbox.field))';
 replacement:='not exists(select 1 from ar_private.tracker_current_dates authority_date where (authority_date.hotel,authority_date.account_id,authority_date.invoice_id,authority_date.field)=(r.hotel,r.account_id,r.invoice_id,ar_private.tracker_outbox.field))';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 or strpos(definition,'authority_date')<>0 then raise exception 'tracker_resolve_authority_alias_definition_drift';end if;
 raise notice 'tracker_resolve_authority_alias before=%',md5(definition);
 execute replace(definition,needle,replacement);
 select proacl,prosecdef,proconfig into after_acl,after_security,after_config from pg_proc where oid='public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure;
 if before_acl is distinct from after_acl or before_security is distinct from after_security or before_config is distinct from after_config then raise exception 'tracker_resolve_authority_alias_attributes_changed';end if;
 raise notice 'tracker_resolve_authority_alias after=%',md5(replace(pg_get_functiondef('public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure),chr(13),''));
end $migration$;
