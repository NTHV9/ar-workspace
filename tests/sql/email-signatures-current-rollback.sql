begin;
do $$
declare actor uuid;other uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();v jsonb;r jsonb;c jsonb;s jsonb;n bigint;
begin
 actor:=ar_private.access_owner();
 v:=public.ar_access_signature_get(actor);if v->>'revision'<>'0' then raise exception 'initial signature incorrect';end if;
 s:=jsonb_build_object('staffId',actor,'name','Synthetic Staff','title','AR Officer','workplace','Synthetic hotel');
 v:=public.ar_access_signature_save(actor,0,true,s);if v->>'revision'<>'1' or v->'signature'<>s then raise exception 'signature save failed';end if;
 if public.ar_access_signature_save(actor,0,true,s) is distinct from v then raise exception 'retry changed signature';end if;
 if (select position from ar_private.access_members where auth_user_id=actor)<>'AR Officer' then raise exception 'position did not sync to account';end if;
 if public.ar_access_signature_save(actor,0,true,jsonb_set(s,'{name}','"Changed"'))->>'error'<>'signature_revision_conflict' then raise exception 'stale write accepted';end if;
 if public.ar_access_signature_get(other) is not null or public.ar_access_signature_save(other,0,true,s)->>'error'<>'access_forbidden' then raise exception 'unapproved signature access';end if;
 if public.ar_access_signature_save(actor,1,true,jsonb_set(s,'{staffId}',to_jsonb(other)))->>'error'<>'signature_invalid' then raise exception 'signature impersonation';end if;
 r:=public.ar_access_staff_save(actor,gen_random_uuid(),null,'synthetic.position@example.invalid','Synthetic Staff',array['phuket'],true,0,'Supervisor');
 if r->>'position'<>'Supervisor' then raise exception 'account position lost';end if;
 select count(*) into n from public.ar_email_template_versions;
 c:='{"name":"Synthetic template","purpose":"billing","stage":null,"subject":"First","richBody":{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Synthetic body"}]}]},"archived":false}';
 v:=public.ar_template_save(actor,tid,0,c);if v->>'revision'<>'1' then raise exception 'template creation failed';end if;
 v:=public.ar_template_save(actor,tid,1,jsonb_set(c,'{subject}','"Latest"'));if v->>'revision'<>'2' then raise exception 'template update failed';end if;
 r:=public.ar_template_list(actor,tid,0);if jsonb_array_length(r->'items')<>1 or r->'items'->0->>'subject'<>'Latest' then raise exception 'template history still exposed';end if;
 if n<>(select count(*) from public.ar_email_template_versions) then raise exception 'template versions still accumulating';end if;
 if public.ar_template_save(actor,tid,0,c)->>'error'<>'template_revision_conflict' then raise exception 'template lost update';end if;
 if has_function_privilege('authenticated','public.ar_access_signature_save(uuid,integer,boolean,jsonb)','execute') then raise exception 'signature RPC exposed';end if;
end$$;
rollback;
