begin;
do $$
declare actor uuid;tid uuid:=gen_random_uuid();content jsonb;v jsonb;r jsonb;d public.ar_email_drafts;before_events bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'allowed user required';end if;
 select count(*) into before_events from public.ar_sent_events;
 content:='{"name":"Synthetic rollback template","purpose":"billing","stage":null,"subject":"Synthetic {{hotel}}","richBody":{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Synthetic body","bold":true}]}]},"archived":false}';
 v:=public.ar_template_save(actor,tid,0,content);if v->>'revision'<>'1' then raise exception 'initial template failed';end if;
 r:=public.ar_template_save(actor,tid,0,content);if r->>'revision'<>'1' then raise exception 'retry duplicate';end if;
 r:=public.ar_template_save(gen_random_uuid(),tid,1,content);if r->>'error'<>'email_forbidden' then raise exception 'unauthorized template write';end if;
 r:=public.ar_template_list(gen_random_uuid(),tid,0);if r->>'error'<>'email_forbidden' then raise exception 'unauthorized template read';end if;
 content:=jsonb_set(content,'{subject}','"Version two"');v:=public.ar_template_save(actor,tid,1,content);if v->>'revision'<>'2' then raise exception 'version increment';end if;
 r:=public.ar_template_save(actor,tid,0,jsonb_set(content,'{subject}','"Stale version"'));if r->>'error'<>'template_revision_conflict' then raise exception 'lost update';end if;
 r:=public.ar_template_list(actor,tid,0);if jsonb_array_length(r->'items')<>2 or r->'items'->1->>'subject'<>'Synthetic {{hotel}}' then raise exception 'immutable prior version missing';end if;
 select * into d from public.ar_email_drafts where owner=actor and id not in(select draft_id from ar_private.mail_deliveries where state<>'sent' and draft_id is not null) limit 1;
 if d.id is null then raise exception 'reviewed working draft required';end if;
 v:=public.ar_email_save_v2(actor,d.id,d.revision,d.purpose,d.recipients,'Synthetic rich draft','Synthetic body',content->'richBody',jsonb_build_object('id',tid,'revision',2,'name',content->>'name'));
 if v?'error' or v->'rich_body' is distinct from content->'richBody' then raise exception 'rich save failed: %',v->>'error';end if;
 r:=public.ar_email_save_v2(actor,d.id,(v->>'revision')::int,d.purpose,d.recipients,'Synthetic rich draft','Synthetic body',content->'richBody',v->'template_ref');if r->>'revision'<>v->>'revision' then raise exception 'no-op revision';end if;
 r:=public.ar_email_save_v2(actor,d.id,d.revision,d.purpose,d.recipients,'Changed','Synthetic body',content->'richBody',null);if r->>'error'<>'email_revision_conflict' then raise exception 'draft revision guard';end if;
 r:=public.ar_mail_claim(actor,gen_random_uuid(),d.id,(v->>'revision')::int,'draft',null,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('recipients',d.recipients,'subject','Synthetic rich draft','body','Synthetic body'));
 if r->>'error'<>'email_revision_conflict' then raise exception 'rich snapshot mismatch accepted: %',r->>'error';end if;
 if has_function_privilege('authenticated','public.ar_template_save(uuid,uuid,integer,jsonb)','execute') or has_function_privilege('service_role','public.ar_email_save(uuid,uuid,integer,text,jsonb,text,text)','execute') then raise exception 'unsafe function privilege';end if;
 if before_events<>(select count(*) from public.ar_sent_events) then raise exception 'unexpected business event';end if;
end $$;
rollback;
