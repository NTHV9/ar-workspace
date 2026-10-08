-- Draft-local attachment display names. Stored bytes, source package and retention are unchanged.
create function ar_private.email_pdf_filename(p_name text) returns text language plpgsql immutable set search_path='' as $$
declare stem text;v text;
begin
 if p_name is null or p_name='' or p_name<>btrim(p_name,U&'\0009\000a\000b\000c\000d \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') or p_name~'[[:cntrl:]<>:"/\\|?*]' or strpos(p_name,'..')>0 then return null;end if;
 stem:=regexp_replace(p_name,'\.pdf$','','i');
 if stem='' or stem~'[. ]$' or stem~*'\.pdf$' or stem~*'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)' then return null;end if;
 v:=case when p_name~*'\.pdf$' then p_name else p_name||'.pdf' end;
 if (select sum(case when ascii(substr(v,n,1))>65535 then 2 else 1 end) from generate_series(1,length(v)) n)>200 then return null;end if;return v;
end$$;
revoke all on function ar_private.email_pdf_filename(text) from public,anon,authenticated,service_role;

create function public.ar_email_save_v3(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text,p_rich_body jsonb,p_template_ref jsonb,p_generated_names jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;r jsonb;renamed jsonb;entry jsonb;f jsonb;name text;names text[]:=array[]::text[];keys text[]:=array[]::text[];changed boolean:=false;staff uuid;headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
begin
 if headers?'x-ar-actor' then
  if jsonb_typeof(headers->'x-ar-actor') is distinct from 'string' or headers->>'x-ar-actor'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('error','email_forbidden');end if;
  staff:=ar_private.request_staff();if staff is null then return jsonb_build_object('error','email_forbidden');end if;
 end if;
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if staff is not null and (p_actor is distinct from ar_private.access_owner() or not d.hotel=any(ar_private.access_hotels((ar_private.access_member(staff)).regions))) then return jsonb_build_object('error','email_forbidden');end if;
 if d.hotel not in('KAT','TSK') then return jsonb_build_object('error','email_region_disabled');end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id and owner=p_actor for share;
 if not found then return jsonb_build_object('error','email_package_changed');end if;
 if j.closed_at is not null then return jsonb_build_object('error','document_closed');end if;
 if j.state<>'ready' or j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 renamed:=d.exports;
 if p_generated_names is not null then
  if jsonb_typeof(p_generated_names) is distinct from 'array' then return jsonb_build_object('error','email_generated_names_invalid');end if;
  if jsonb_array_length(p_generated_names)<>jsonb_array_length(d.exports) or jsonb_array_length(p_generated_names)>50 then return jsonb_build_object('error','email_generated_names_invalid');end if;
  for entry in select value from jsonb_array_elements(p_generated_names) loop
   if jsonb_typeof(entry) is distinct from 'object' or entry-array['storageKey','name']<>'{}'::jsonb or not(entry?&array['storageKey','name']) or jsonb_typeof(entry->'storageKey') is distinct from 'string' or jsonb_typeof(entry->'name') is distinct from 'string' then return jsonb_build_object('error','email_generated_names_invalid');end if;
   if entry->>'storageKey'=any(keys) then return jsonb_build_object('error','email_generated_names_invalid');end if;
   select value into f from jsonb_array_elements(d.exports) where value->>'storage_key'=entry->>'storageKey';
   if not found then return jsonb_build_object('error','email_generated_names_invalid');end if;
   name:=entry->>'name';
   -- Old packages may contain legacy punctuation; unchanged names are preserved.
   if name is distinct from f->>'name' then name:=ar_private.email_pdf_filename(name);if name is null then return jsonb_build_object('error','email_generated_names_invalid');end if;end if;
   if lower(normalize(name,NFC))=any(names) then return jsonb_build_object('error','email_generated_names_invalid');end if;
   names:=array_append(names,lower(normalize(name,NFC)));keys:=array_append(keys,entry->>'storageKey');
  end loop;
  select coalesce(jsonb_agg(x.value||jsonb_build_object('name',case when e.value->>'name'=x.value->>'name' then x.value->>'name' else ar_private.email_pdf_filename(e.value->>'name') end) order by ord),'[]') into renamed
  from jsonb_array_elements(d.exports) with ordinality x(value,ord) join jsonb_array_elements(p_generated_names) e on e.value->>'storageKey'=x.value->>'storage_key';
  changed:=renamed is distinct from d.exports;
 end if;
 -- Claimers also lock this draft. Validate before delegating to the content writer.
 if changed and (exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and (revision=d.revision or state in('creating','uncertain','created'))) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and (revision=d.revision or state<>'sent'))) then return jsonb_build_object('error','email_handoff_pending');end if;
 r:=public.ar_email_save_v2(p_actor,p_id,p_revision,p_purpose,p_recipients,p_subject,p_body,p_rich_body,p_template_ref);
 if r?'error' then return r;end if;
 if changed then
  update public.ar_email_drafts set exports=renamed,revision=case when revision=d.revision then revision+1 else revision end,updated_at=now() where id=p_id;
  return public.ar_email_get(p_actor,p_id);
 end if;
 return r;
end$$;
revoke all on function public.ar_email_save_v3(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ar_email_save_v3(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb,jsonb) to service_role;
