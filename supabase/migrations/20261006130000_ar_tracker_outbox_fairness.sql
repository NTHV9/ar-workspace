-- Rotate eligible work by its last check/publication result. Technical holds and
-- uncertain uploads remain eligible, but cannot monopolize every 100-item page.
create index tracker_outbox_active_rotation on ar_private.tracker_outbox(owner,updated_at,created_at,id)
 where state in('pending','uncertain','held');
do $$
declare definition text;needle text:='order by q.created_at,q.id limit 100';
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_outbox(uuid,text,uuid)'::regprocedure),E'\r','');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_outbox_rotation_definition_drift';end if;
 execute replace(definition,needle,'order by q.updated_at,q.created_at,q.id limit 100');
end $$;