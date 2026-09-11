create table ar_private.gmail_oauth_states(state_hash text primary key,owner uuid not null,document_job_id uuid not null,verifier jsonb not null,expires_at timestamptz not null,used_at timestamptz);
create table ar_private.gmail_connections(owner uuid primary key,email text not null check(lower(email)='ar@katathani.com'),payload jsonb not null,scope text not null,connected_at timestamptz not null default now());
create table ar_private.gmail_draft_attempts(id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.ar_email_drafts(id),revision integer not null,message_id text not null,state text not null default 'creating' check(state in ('creating','created','uncertain')),gmail_draft_id text,gmail_message_id text,created_at timestamptz not null default now(),unique(draft_id,revision));
revoke all on ar_private.gmail_oauth_states,ar_private.gmail_connections,ar_private.gmail_draft_attempts from public,anon,authenticated;
create function public.ar_gmail_state_create(p_owner uuid,p_hash text,p_job uuid,p_verifier jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ar_document_jobs where id=p_job and owner=p_owner) then return false;end if;
 insert into ar_private.gmail_oauth_states values(p_hash,p_owner,p_job,p_verifier,now()+interval '10 minutes',null);return true;
end $$;
create function public.ar_gmail_state_consume(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.gmail_oauth_states;
begin update ar_private.gmail_oauth_states set used_at=now() where state_hash=p_hash and used_at is null and expires_at>now() returning * into s;if not found then return null;end if;return to_jsonb(s);end $$;
create function public.ar_gmail_connection_put(p_owner uuid,p_email text,p_payload jsonb,p_scope text) returns boolean language plpgsql security definer set search_path='' as $$
begin if lower(p_email)<>'ar@katathani.com' or not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return false;end if;
 insert into ar_private.gmail_connections(owner,email,payload,scope) values(p_owner,p_email,p_payload,p_scope) on conflict(owner) do update set email=excluded.email,payload=excluded.payload,scope=excluded.scope,connected_at=now();return true;end $$;
create function public.ar_gmail_connection_get(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(c) from ar_private.gmail_connections c where owner=p_owner$$;
create function public.ar_gmail_attempt_get(p_owner uuid,p_draft uuid,p_revision integer) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(a) from ar_private.gmail_draft_attempts a join public.ar_email_drafts d on d.id=a.draft_id where d.owner=p_owner and d.id=p_draft and a.revision=p_revision$$;
create function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;a ar_private.gmail_draft_attempts;
begin select * into d from public.ar_email_drafts where id=p_draft and owner=p_owner for update;if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if not j.acknowledged or j.revision<>d.document_revision or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 select * into a from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision;
 if found then return to_jsonb(a)||jsonb_build_object('claimed',false);end if;
 insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values(p_draft,p_revision,p_message_id) returning * into a;return to_jsonb(a)||jsonb_build_object('claimed',true);
end $$;
create function public.ar_gmail_attempt_finish(p_owner uuid,p_id uuid,p_draft_id text,p_message_id text) returns boolean language plpgsql security definer set search_path='' as $$
begin update ar_private.gmail_draft_attempts a set state=case when p_draft_id is null then 'uncertain' else 'created' end,gmail_draft_id=p_draft_id,gmail_message_id=p_message_id from public.ar_email_drafts d where d.id=a.draft_id and d.owner=p_owner and a.id=p_id and a.state in ('creating','uncertain');return found;end $$;
revoke all on function public.ar_gmail_state_create(uuid,text,uuid,jsonb),public.ar_gmail_state_consume(text),public.ar_gmail_connection_put(uuid,text,jsonb,text),public.ar_gmail_connection_get(uuid),public.ar_gmail_attempt_get(uuid,uuid,integer),public.ar_gmail_attempt_claim(uuid,uuid,integer,text),public.ar_gmail_attempt_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ar_gmail_state_create(uuid,text,uuid,jsonb),public.ar_gmail_state_consume(text),public.ar_gmail_connection_put(uuid,text,jsonb,text),public.ar_gmail_connection_get(uuid),public.ar_gmail_attempt_get(uuid,uuid,integer),public.ar_gmail_attempt_claim(uuid,uuid,integer,text),public.ar_gmail_attempt_finish(uuid,uuid,text,text) to service_role;
