-- Private evidence reservations and retained diagnostics. No Storage delete or accounting write.
create function ar_private.remittance_file_limits(p_limits jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; ceiling bigint;
begin
 if jsonb_typeof(p_limits) is distinct from 'object' then return false;end if;
 if p_limits-array['maxFileBytes','maxFiles','maxTotalFileBytes']<>'{}'::jsonb then return false;end if;
 foreach k in array array['maxFileBytes','maxFiles','maxTotalFileBytes'] loop
  if jsonb_typeof(p_limits->k) is distinct from 'number' or length(p_limits->>k)>9 or (p_limits->>k)!~'^[1-9][0-9]*$' then return false;end if;
  ceiling:=case k when 'maxFileBytes' then 20971520 when 'maxFiles' then 200 else 536870912 end;
  if (p_limits->>k)::bigint>ceiling then return false;end if;
 end loop;
 return true;
end $$;

create function ar_private.remittance_file_json(f ar_private.remittance_files) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'byteCount',f.byte_count,'sha256',f.sha256,'state',f.state,'error',f.error_code,'createdAt',f.created_at,'storageKey',f.storage_key);
$$;

create function ar_private.remittance_file_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'remittance_file_immutable';end if;
 if row(new.id,new.record_id,new.name,new.mime,new.byte_count,new.sha256,new.storage_key,new.inspection,new.created_at)
    is distinct from row(old.id,old.record_id,old.name,old.mime,old.byte_count,old.sha256,old.storage_key,old.inspection,old.created_at)
 then raise exception 'remittance_file_immutable';end if;
 return new;
end $$;
create trigger ar_remittance_file_immutable before update or delete on ar_private.remittance_files for each row execute function ar_private.remittance_file_immutable();

create function ar_private.remittance_diagnostic_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'remittance_diagnostic_immutable';end if;
 if row(new.owner,new.command_id,new.name,new.mime,new.byte_count,new.sha256,new.storage_key,new.created_at)
    is distinct from row(old.owner,old.command_id,old.name,old.mime,old.byte_count,old.sha256,old.storage_key,old.created_at)
    or old.verified and not new.verified
 then raise exception 'remittance_diagnostic_immutable';end if;
 return new;
end $$;
create trigger ar_remittance_diagnostic_immutable before update or delete on ar_private.remittance_diagnostics for each row execute function ar_private.remittance_diagnostic_immutable();

create function public.ar_remittance_file_begin(p_actor uuid,p_id uuid,p_revision integer,p_file jsonb,p_limits jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ar_remittances;f ar_private.remittance_files;fid uuid;v_name text;v_mime text;v_bytes bigint;v_sha text;v_inspection jsonb;v_key text;v_count bigint;v_total numeric;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or p_revision is null or p_revision<0 or jsonb_typeof(p_file) is distinct from 'object' then return jsonb_build_object('error','remittance_invalid');end if;
 if p_file-array['id','name','mime','byteCount','sha256','inspection']<>'{}'::jsonb
    or jsonb_typeof(p_file->'id') is distinct from 'string' or (p_file->>'id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_file->'name') is distinct from 'string' or jsonb_typeof(p_file->'mime') is distinct from 'string'
    or jsonb_typeof(p_file->'byteCount') is distinct from 'number' or length(p_file->>'byteCount')>8 or (p_file->>'byteCount')!~'^[1-9][0-9]*$'
    or jsonb_typeof(p_file->'sha256') is distinct from 'string' or (p_file->>'sha256')!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_file->'inspection') is distinct from 'object'
 then return jsonb_build_object('error','remittance_invalid');end if;
 fid:=(p_file->>'id')::uuid;v_name:=p_file->>'name';v_mime:=p_file->>'mime';v_bytes:=(p_file->>'byteCount')::bigint;v_sha:=p_file->>'sha256';v_inspection:=p_file->'inspection';
 if length(v_name) not between 1 and 200 or btrim(v_name)<>v_name or v_name~'[[:cntrl:]]' or strpos(v_name,'/')>0 or strpos(v_name,chr(92))>0 or right(v_name,1) in('.',' ')
    or v_bytes>20971520 or v_mime not in('application/pdf','image/png','image/jpeg')
    or not ((v_mime='application/pdf' and lower(v_name)~'\.pdf$') or (v_mime='image/png' and lower(v_name)~'\.png$') or (v_mime='image/jpeg' and lower(v_name)~'\.jpe?g$'))
    or v_inspection->'version' is distinct from '1'::jsonb
 then return jsonb_build_object('error','remittance_invalid');end if;
 if v_mime='application/pdf' then
  if v_inspection-array['version','pages']<>'{}'::jsonb or jsonb_typeof(v_inspection->'pages') is distinct from 'number' or length(v_inspection->>'pages')>6 or (v_inspection->>'pages')!~'^[1-9][0-9]*$' then return jsonb_build_object('error','remittance_invalid');end if;
  if (v_inspection->>'pages')::integer>100000 then return jsonb_build_object('error','remittance_invalid');end if;
 else
  if v_inspection-array['version','width','height']<>'{}'::jsonb or jsonb_typeof(v_inspection->'width') is distinct from 'number' or jsonb_typeof(v_inspection->'height') is distinct from 'number'
     or length(v_inspection->>'width')>4 or length(v_inspection->>'height')>4 or (v_inspection->>'width')!~'^[1-9][0-9]*$' or (v_inspection->>'height')!~'^[1-9][0-9]*$' then return jsonb_build_object('error','remittance_invalid');end if;
  if (v_inspection->>'width')::integer>8192 or (v_inspection->>'height')::integer>8192 or (v_inspection->>'width')::integer*(v_inspection->>'height')::integer>8000000 then return jsonb_build_object('error','remittance_invalid');end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 select * into r from public.ar_remittances where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','remittance_missing');end if;
 v_key:='remittances/'||p_id::text||'/'||fid::text;
 select * into f from ar_private.remittance_files where id=fid;
 if found then
  if f.record_id<>p_id or f.state='removed' or row(f.name,f.mime,f.byte_count,f.sha256,f.storage_key,f.inspection) is distinct from row(v_name,v_mime,v_bytes,v_sha,v_key,v_inspection) then return jsonb_build_object('error','remittance_file_conflict');end if;
  return jsonb_build_object('file',ar_private.remittance_file_json(f),'record',ar_private.remittance_record_json(p_id,true));
 end if;
 if r.state<>'active' then return jsonb_build_object('error','remittance_voided');end if;
 if r.revision<>p_revision then return jsonb_build_object('error','remittance_revision_conflict');end if;
 if not ar_private.remittance_file_limits(p_limits) then return jsonb_build_object('error','remittance_file_limit');end if;
 -- Removed evidence retains its storage reservation. Only the active link count shrinks.
 select count(*) filter(where state in('pending','ready')),coalesce(sum(byte_count),0) into v_count,v_total from ar_private.remittance_files where record_id=p_id;
 if v_bytes>(p_limits->>'maxFileBytes')::bigint or v_count+1>(p_limits->>'maxFiles')::bigint or v_total+v_bytes>(p_limits->>'maxTotalFileBytes')::bigint then return jsonb_build_object('error','remittance_file_limit');end if;
 insert into ar_private.remittance_files(id,record_id,name,mime,byte_count,sha256,storage_key,inspection)
 values(fid,p_id,v_name,v_mime,v_bytes,v_sha,v_key,v_inspection) returning * into f;
 return jsonb_build_object('file',ar_private.remittance_file_json(f),'record',ar_private.remittance_record_json(p_id,true));
end $$;

create function public.ar_remittance_file_finish(p_actor uuid,p_id uuid,p_file_id uuid,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ar_remittances;f ar_private.remittance_files;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or p_file_id is null or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then return jsonb_build_object('error','remittance_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 select * into r from public.ar_remittances where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','remittance_missing');end if;
 select * into f from ar_private.remittance_files where id=p_file_id and record_id=p_id;
 if not found then return jsonb_build_object('error','remittance_file_missing');end if;
 if f.sha256<>p_sha256 then return jsonb_build_object('error','remittance_file_conflict');end if;
 if f.state='ready' then return ar_private.remittance_record_json(p_id,true);end if;
 if f.state='removed' then return jsonb_build_object('error','remittance_file_removed');end if;
 if r.state<>'active' then return jsonb_build_object('error','remittance_voided');end if;
 if r.revision=2147483647 then return jsonb_build_object('error','remittance_revision_conflict');end if;
 -- The Worker has read back and checked the immutable hash before this service-only call.
 update ar_private.remittance_files set state='ready',ready_at=now(),error_code=null where id=p_file_id;
 update public.ar_remittances set revision=revision+1,updated_at=now() where id=p_id;
 perform ar_private.remittance_history_add(p_actor,p_id,'file_added','Supporting evidence verified');
 return ar_private.remittance_record_json(p_id,true);
end $$;

create function public.ar_remittance_file_get(p_actor uuid,p_id uuid,p_file_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f ar_private.remittance_files;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or p_file_id is null then return jsonb_build_object('error','remittance_invalid');end if;
 if not exists(select 1 from public.ar_remittances where id=p_id and owner=p_actor) then return jsonb_build_object('error','remittance_missing');end if;
 select * into f from ar_private.remittance_files where id=p_file_id and record_id=p_id;
 if not found then return null;end if;
 -- Removed metadata is required for restore. Normal Worker downloads require state=ready.
 return ar_private.remittance_file_json(f);
end $$;

create function public.ar_remittance_file_status(p_actor uuid,p_id uuid,p_file_id uuid,p_command uuid,p_revision integer,p_restore boolean,p_reason text,p_limits jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ar_remittances;f ar_private.remittance_files;v_input jsonb;v_result jsonb;v_action text;v_count bigint;v_total numeric;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_id is null or p_file_id is null or p_command is null or p_revision is null or p_revision<0 or p_restore is null then return jsonb_build_object('error','remittance_invalid');end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then return jsonb_build_object('error','remittance_change_reason_required');end if;
 p_reason:=btrim(p_reason);v_action:=case when p_restore then 'file_restored' else 'file_removed' end;
 v_input:=jsonb_build_object('fileId',p_file_id,'revision',p_revision,'restore',p_restore,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 select * into r from public.ar_remittances where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','remittance_missing');end if;
 v_result:=ar_private.remittance_command_result(p_actor,p_command,p_id,v_action,v_input);if v_result is not null then return v_result;end if;
 if r.state<>'active' then return jsonb_build_object('error','remittance_voided');end if;
 if r.revision<>p_revision or r.revision=2147483647 then return jsonb_build_object('error','remittance_revision_conflict');end if;
 select * into f from ar_private.remittance_files where id=p_file_id and record_id=p_id;
 if not found then return jsonb_build_object('error','remittance_file_missing');end if;
 if p_restore then
  if f.state='pending' then return jsonb_build_object('error','remittance_file_pending');end if;
  if f.state='ready' then return jsonb_build_object('error','remittance_file_conflict');end if;
  if not ar_private.remittance_file_limits(p_limits) then return jsonb_build_object('error','remittance_file_limit');end if;
  select count(*) filter(where state in('pending','ready')),coalesce(sum(byte_count),0) into v_count,v_total from ar_private.remittance_files where record_id=p_id;
  -- The restored file's bytes are already included in retained/reserved total size.
  if f.byte_count>(p_limits->>'maxFileBytes')::bigint or v_count+1>(p_limits->>'maxFiles')::bigint or v_total>(p_limits->>'maxTotalFileBytes')::bigint then return jsonb_build_object('error','remittance_file_limit');end if;
  -- Worker proves the retained bytes immediately before this guarded restore command.
  update ar_private.remittance_files set state='ready',ready_at=coalesce(ready_at,now()),removed_at=null,error_code=null where id=p_file_id;
 else
  if f.state='removed' then return jsonb_build_object('error','remittance_file_removed');end if;
  update ar_private.remittance_files set state='removed',removed_at=now(),error_code=null where id=p_file_id;
 end if;
 update public.ar_remittances set revision=revision+1,updated_at=now() where id=p_id;
 perform ar_private.remittance_history_add(p_actor,p_id,v_action,p_reason);
 return ar_private.remittance_command_store(p_actor,p_command,p_id,v_action,v_input);
end $$;

create function public.ar_remittance_diagnostic_begin(p_actor uuid,p_command uuid,p_file jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d ar_private.remittance_diagnostics;v_key text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_command is null then return jsonb_build_object('error','remittance_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 v_key:='remittance-diagnostics/'||p_actor::text||'/'||p_command::text;
 select * into d from ar_private.remittance_diagnostics where owner=p_actor and command_id=p_command for update;
 if found then
  if p_file is distinct from jsonb_build_object('name',d.name,'mime',d.mime,'byteCount',d.byte_count,'sha256',d.sha256) or d.storage_key<>v_key then return jsonb_build_object('error','remittance_command_conflict');end if;
 else
  -- Exact deterministic PDF produced by worker/drive/archive.ts syntheticPdf().
  if p_file is distinct from jsonb_build_object('name','Remittance-connection-test.pdf','mime','application/pdf','byteCount',622,'sha256','628dbd1142c94251a25cfc67af37b7df11ae6378ed91addf74870bf7d0d7c3db') then return jsonb_build_object('error','remittance_invalid');end if;
  insert into ar_private.remittance_diagnostics(owner,command_id,name,mime,byte_count,sha256,storage_key)
  values(p_actor,p_command,p_file->>'name',p_file->>'mime',(p_file->>'byteCount')::integer,p_file->>'sha256',v_key) returning * into d;
 end if;
 return jsonb_build_object('storageKey',d.storage_key,'verified',d.verified,'byteCount',d.byte_count,'sha256',d.sha256);
end $$;

create function public.ar_remittance_diagnostic_finish(p_actor uuid,p_command uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d ar_private.remittance_diagnostics;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_command is null then return jsonb_build_object('error','remittance_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,946));
 select * into d from ar_private.remittance_diagnostics where owner=p_actor and command_id=p_command for update;
 if not found then return jsonb_build_object('error','remittance_missing');end if;
 if not d.verified then update ar_private.remittance_diagnostics set verified=true,verified_at=now() where owner=p_actor and command_id=p_command;end if;
 return jsonb_build_object('passed',true,'byteCount',d.byte_count,'sha256',d.sha256,'retained',true);
end $$;

revoke all on function ar_private.remittance_file_limits(jsonb),ar_private.remittance_file_json(ar_private.remittance_files),ar_private.remittance_file_immutable(),ar_private.remittance_diagnostic_immutable() from public,anon,authenticated,service_role;
revoke all on function public.ar_remittance_file_begin(uuid,uuid,integer,jsonb,jsonb),public.ar_remittance_file_finish(uuid,uuid,uuid,text),public.ar_remittance_file_get(uuid,uuid,uuid),public.ar_remittance_file_status(uuid,uuid,uuid,uuid,integer,boolean,text,jsonb),public.ar_remittance_diagnostic_begin(uuid,uuid,jsonb),public.ar_remittance_diagnostic_finish(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_remittance_file_begin(uuid,uuid,integer,jsonb,jsonb),public.ar_remittance_file_finish(uuid,uuid,uuid,text),public.ar_remittance_file_get(uuid,uuid,uuid),public.ar_remittance_file_status(uuid,uuid,uuid,uuid,integer,boolean,text,jsonb),public.ar_remittance_diagnostic_begin(uuid,uuid,jsonb),public.ar_remittance_diagnostic_finish(uuid,uuid) to service_role;
