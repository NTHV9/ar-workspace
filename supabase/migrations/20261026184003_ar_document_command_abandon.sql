-- Exact create-command cancellation. Existing job/file/email retention stays authoritative.
alter table ar_private.document_commands add column request_actor uuid,add column request_digest text;
create table ar_private.document_command_exits(
 owner uuid not null,command_key uuid not null,actor uuid not null,hotel text not null,
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 requested_at timestamptz not null default clock_timestamp(),settled_at timestamptz,
 primary key(owner,command_key)
);
alter table ar_private.document_command_exits enable row level security;
revoke all on ar_private.document_command_exits from public,anon,authenticated,service_role;

create function ar_private.document_request_digest(p_hotel text,p_account text,p_ids text[],p_content text,p_layout text,p_purpose text,p_source text)
returns text language plpgsql immutable set search_path='' as $$
declare field text;canonical text:='';
begin
 foreach field in array array['ar-document-create-v1',p_hotel,p_account,cardinality(p_ids)::text]||p_ids||array[p_content,p_layout,p_purpose,p_source] loop
  if field is null then raise exception 'document_request_invalid';end if;
  canonical:=canonical||octet_length(convert_to(field,'UTF8'))::text||':'||field;
 end loop;
 return encode(sha256(convert_to(canonical,'UTF8')),'hex');
end$$;
revoke all on function ar_private.document_request_digest(text,text,text[],text,text,text,text) from public,anon,authenticated,service_role;

alter function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text) rename to document_create_before_command_exit;
alter function public.document_create_before_command_exit(uuid,uuid,text,text,text[],text,text,text,text) set schema ar_private;
revoke all on function ar_private.document_create_before_command_exit(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated,service_role;
create function public.ar_document_create_v5(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');digest text;result jsonb;c ar_private.document_commands;t ar_private.document_command_exits;
begin
 actor:=coalesce((headers->>'x-ar-actor')::uuid,p_owner);
 if p_owner is distinct from ar_private.access_owner() then raise exception 'document_forbidden';end if;
 perform public.ar_access_authorize(actor,'hotel',p_hotel);
 digest:=ar_private.document_request_digest(p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into t from ar_private.document_command_exits where owner=p_owner and command_key=p_command_key;
 if found then
  if t.actor<>actor or t.hotel<>p_hotel or t.payload_digest<>digest then raise exception 'document_command_conflict';end if;
  return jsonb_build_object('error','document_command_cancelled');
 end if;
 select * into c from ar_private.document_commands where owner=p_owner and command_key=p_command_key;
 if found and c.request_actor is not null and (c.request_actor<>actor or c.request_digest<>digest) then raise exception 'document_command_conflict';end if;
 result:=ar_private.document_create_before_command_exit(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 if result ? 'id' then update ar_private.document_commands set request_actor=coalesce(request_actor,actor),request_digest=coalesce(request_digest,digest) where owner=p_owner and command_key=p_command_key;end if;
 return result;
end$$;

-- This transaction takes ONLY the command lock. Never call abandon while holding it:
-- create's command -> Hotel ordering and abandon's global -> actor -> row ordering
-- must not be inverted. Durable exact tombstones bridge the two transactions.
create function public.ar_document_command_abandon(p_actor uuid,p_owner uuid,p_command_key uuid,p_hotel text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.document_commands;t ar_private.document_command_exits;digest text;headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
begin
 if p_actor is null or p_owner is distinct from ar_private.access_owner() or p_command_key is null or p_payload_digest is null or p_payload_digest!~'^[0-9a-f]{64}$' or headers?'x-ar-actor' and headers->>'x-ar-actor' is distinct from p_actor::text then raise exception 'document_forbidden';end if;
 perform public.ar_access_authorize(p_actor,'hotel',p_hotel);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into t from ar_private.document_command_exits where owner=p_owner and command_key=p_command_key;
 if found and (t.actor<>p_actor or t.hotel<>p_hotel or t.payload_digest<>p_payload_digest) then raise exception 'document_command_conflict';end if;
 select * into c from ar_private.document_commands where owner=p_owner and command_key=p_command_key;
 if found then
  digest:=ar_private.document_request_digest(c.payload->>'hotel',c.payload->>'account_id',array(select jsonb_array_elements_text(c.payload->'ids')),c.payload->>'content',c.payload->>'layout',c.payload->>'purpose',c.payload->>'statement_source');
  if c.payload->>'hotel' is distinct from p_hotel or digest<>p_payload_digest or coalesce(c.request_actor,p_owner)<>p_actor then raise exception 'document_command_conflict';end if;
 end if;
 insert into ar_private.document_command_exits(owner,command_key,actor,hotel,payload_digest) values(p_owner,p_command_key,p_actor,p_hotel,p_payload_digest) on conflict(owner,command_key) do nothing;
 return jsonb_build_object('commandKey',p_command_key,'hotel',p_hotel,'payloadDigest',p_payload_digest,'job_id',c.job_id,'outcome',case when c.job_id is null then 'cancelled' else 'resolved' end);
end$$;

-- Existing maintenance consumes ONLY these exact durable requests when the second
-- HTTP/RPC is lost. No account scan, create replay, or new scheduler.
alter function public.ar_document_finalize_abandoned(uuid,integer) rename to document_finalize_before_command_exit;
alter function public.document_finalize_before_command_exit(uuid,integer) set schema ar_private;
revoke all on function ar_private.document_finalize_before_command_exit(uuid,integer) from public,anon,authenticated,service_role;
create function public.ar_document_finalize_abandoned(p_actor uuid,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;receipt jsonb;result jsonb:='[]';
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 -- Same global/actor order as existing abandon; no61705 lock is taken here.
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 for r in select t.owner,t.command_key,c.job_id from ar_private.document_command_exits t join ar_private.document_commands c using(owner,command_key)
 where t.owner=p_actor and t.settled_at is null order by t.requested_at,t.command_key limit p_limit loop
  receipt:=public.ar_document_abandon(p_actor,r.job_id);result:=result||jsonb_build_array(receipt);
  if receipt->>'outcome' in('discarded','pending','protected') then update ar_private.document_command_exits set settled_at=clock_timestamp() where owner=r.owner and command_key=r.command_key;end if;
 end loop;
 return result||ar_private.document_finalize_before_command_exit(p_actor,p_limit);
end$$;
revoke all on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text),public.ar_document_command_abandon(uuid,uuid,uuid,text,text),public.ar_document_finalize_abandoned(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_create_v5(uuid,uuid,text,text,text[],text,text,text,text),public.ar_document_command_abandon(uuid,uuid,uuid,text,text),public.ar_document_finalize_abandoned(uuid,integer) to service_role;
-- Settle command tombstones atomically with every existing abandon receipt. A
-- protected receipt must never become an automatic future discard attempt.
alter function public.ar_document_abandon(uuid,uuid) rename to document_abandon_before_command_exit;
alter function public.document_abandon_before_command_exit(uuid,uuid) set schema ar_private;
revoke all on function ar_private.document_abandon_before_command_exit(uuid,uuid) from public,anon,authenticated,service_role;
create function public.ar_document_abandon(p_actor uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 receipt:=ar_private.document_abandon_before_command_exit(p_actor,p_job_id);
 if receipt->>'outcome' in('discarded','pending','protected') then
  update ar_private.document_command_exits t set settled_at=coalesce(t.settled_at,clock_timestamp())
  from ar_private.document_commands c where t.owner=p_actor and c.owner=t.owner and c.command_key=t.command_key and c.job_id=p_job_id;
 end if;
 return receipt;
end$$;
revoke all on function public.ar_document_abandon(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_abandon(uuid,uuid) to service_role;
