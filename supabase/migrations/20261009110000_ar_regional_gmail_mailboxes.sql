-- 108: independent regional provider identities; app authentication is unchanged.
create function ar_private.gmail_sender(p_mailbox text) returns text language sql immutable set search_path='' as $$select case p_mailbox when 'phuket' then 'ar@katathani.com' when 'khao-lak' then 'ar@thesandskhaolak.com' end$$;
create function ar_private.gmail_hotel_mailbox(p_hotel text) returns text language sql immutable set search_path='' as $$select case when p_hotel in('KAT','TSK') then 'phuket' when p_hotel in('TLKL','WAKL','TLFO','TSAN') then 'khao-lak' end$$;
create function ar_private.gmail_admin(p_owner uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');staff uuid;
begin
 if p_owner is distinct from ar_private.access_owner() then return false;end if;
 if headers?'x-ar-actor' then
 if jsonb_typeof(headers->'x-ar-actor') is distinct from 'string' or headers->>'x-ar-actor'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false;end if;
 staff:=ar_private.request_staff();if staff is null or not coalesce((ar_private.access_member(staff)).administrator,false) then return false;end if;
 end if;return true;
end$$;
create function ar_private.gmail_region_access(p_owner uuid,p_mailbox text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');staff uuid;
begin
 if p_owner is distinct from ar_private.access_owner() or ar_private.gmail_sender(p_mailbox) is null then return false;end if;
 if headers?'x-ar-actor' then
 if jsonb_typeof(headers->'x-ar-actor') is distinct from 'string' or headers->>'x-ar-actor'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false;end if;
 staff:=ar_private.request_staff();if staff is null or not p_mailbox=any((ar_private.access_member(staff)).regions) then return false;end if;
 end if;return true;
end$$;
create function public.ar_gmail_connection_refresh_region(p_owner uuid,p_mailbox text,p_payload jsonb,p_scope text,p_revision integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.gmail_region_access(p_owner,p_mailbox) or p_revision is null or p_revision<1 or jsonb_typeof(p_payload) is distinct from 'object' or p_scope is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('gmail_connection:'||p_owner||':'||p_mailbox,0));
 update ar_private.gmail_connections set payload=p_payload,scope=p_scope,cipher_version=2,revision=revision+1,connected_at=clock_timestamp() where owner=p_owner and mailbox=p_mailbox and revision=p_revision;return found;
end$$;
revoke all on function ar_private.gmail_region_access(uuid,text),public.ar_gmail_connection_refresh_region(uuid,text,jsonb,text,integer) from public,anon,authenticated;
revoke all on function ar_private.gmail_region_access(uuid,text) from service_role;
grant execute on function public.ar_gmail_connection_refresh_region(uuid,text,jsonb,text,integer) to service_role;
-- Fail closed rather than guessing the provenance of any unexpected historical receipt.
do $$begin
 if exists(select 1 from ar_private.gmail_connections where lower(email)<>'ar@katathani.com') or exists(select 1 from public.ar_sent_events where hotel not in('KAT','TSK')) or exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.hotel not in('KAT','TSK')) or exists(select 1 from ar_private.mail_deliveries where (snapshot#>>'{draft,hotel}' is not null and snapshot#>>'{draft,hotel}' not in('KAT','TSK')) or (snapshot#>>'{expected,mailbox}' is not null and snapshot#>>'{expected,mailbox}'<>'phuket') or (snapshot#>>'{expected,sender}' is not null and snapshot#>>'{expected,sender}'<>'ar@katathani.com') or (snapshot#>>'{expected,signatureHotel}' is not null and (snapshot#>>'{expected,signatureHotel}' not in('KAT','TSK','TLKL','WAKL','TLFO','TSAN') or mode<>'test' and snapshot#>>'{expected,signatureHotel}' not in('KAT','TSK')))) then raise exception 'gmail_legacy_mailbox_invariant';end if;
end$$;
alter table ar_private.gmail_connections drop constraint gmail_connections_pkey,drop constraint gmail_connections_email_check;
alter table ar_private.gmail_connections add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak')),add column revision integer not null default 1 check(revision>0),add column cipher_version integer not null default 1 check(cipher_version in(1,2)),add primary key(owner,mailbox),add check(email=ar_private.gmail_sender(mailbox)),add check(cipher_version=2 or mailbox='phuket');
alter table ar_private.gmail_connections alter column mailbox drop default,alter column cipher_version drop default;
alter table ar_private.gmail_oauth_states alter column document_job_id drop not null,add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak')),add column connection_revision integer not null default 0 check(connection_revision>=0);
-- In-flight old states cannot safely overwrite a connection created since initiation.
update ar_private.gmail_oauth_states set used_at=coalesce(used_at,clock_timestamp());
create function public.ar_gmail_connection_get_region(p_owner uuid,p_mailbox text) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(c) from ar_private.gmail_connections c where owner=p_owner and mailbox=p_mailbox and ar_private.gmail_region_access(p_owner,p_mailbox)$$;
create function public.ar_gmail_connection_put_region(p_owner uuid,p_mailbox text,p_email text,p_payload jsonb,p_scope text,p_revision integer,p_cipher_version integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.gmail_admin(p_owner) or ar_private.gmail_sender(p_mailbox) is null or p_email is distinct from ar_private.gmail_sender(p_mailbox) or p_cipher_version is distinct from 2 or p_revision is null or p_revision<0 or jsonb_typeof(p_payload) is distinct from 'object' or p_scope is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('gmail_connection:'||p_owner||':'||p_mailbox,0));
 if p_revision=0 then
 insert into ar_private.gmail_connections(owner,mailbox,email,payload,scope,revision,cipher_version) values(p_owner,p_mailbox,p_email,p_payload,p_scope,1,2) on conflict(owner,mailbox) do nothing;return found;
 end if;
 update ar_private.gmail_connections set email=p_email,payload=p_payload,scope=p_scope,cipher_version=2,revision=revision+1,connected_at=clock_timestamp() where owner=p_owner and mailbox=p_mailbox and revision=p_revision;return found;
end$$;
create function public.ar_gmail_state_create_region(p_owner uuid,p_hash text,p_job uuid,p_verifier jsonb,p_mailbox text,p_revision integer) returns boolean language plpgsql security definer set search_path='' as $$
declare h text;actual integer;
begin
 if not ar_private.gmail_admin(p_owner) or ar_private.gmail_sender(p_mailbox) is null or p_revision is null or p_revision<0 or jsonb_typeof(p_verifier) is distinct from 'object' then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('gmail_connection:'||p_owner||':'||p_mailbox,0));
 select coalesce((select revision from ar_private.gmail_connections where owner=p_owner and mailbox=p_mailbox),0) into actual;if actual<>p_revision then return false;end if;
 if p_job is not null then select hotel into h from public.ar_document_jobs where id=p_job and owner=p_owner;if ar_private.gmail_hotel_mailbox(h) is distinct from p_mailbox then return false;end if;end if;
 insert into ar_private.gmail_oauth_states(state_hash,owner,document_job_id,verifier,expires_at,mailbox,connection_revision) values(p_hash,p_owner,p_job,p_verifier,clock_timestamp()+interval '10 minutes',p_mailbox,p_revision);return true;
end$$;
-- Retire unversioned writers; regional readers explicitly identify old Phuket seals.
create or replace function public.ar_gmail_connection_put(p_owner uuid,p_email text,p_payload jsonb,p_scope text) returns boolean language sql security definer set search_path='' as $$select false$$;
create or replace function public.ar_gmail_state_create(p_owner uuid,p_hash text,p_job uuid,p_verifier jsonb) returns boolean language sql security definer set search_path='' as $$select false$$;
create or replace function public.ar_gmail_connection_get(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$select public.ar_gmail_connection_get_region(p_owner,'phuket')$$;

alter table ar_private.mail_deliveries add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak'));
-- DDL holds an exclusive table lock; suspend only the sent-manifest trigger for
-- this additive provenance backfill, then restore it before accepting any writes.
alter table ar_private.mail_deliveries disable trigger ar_preserve_sent_manifest;
update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected}',coalesce(snapshot->'expected','{}')||'{"mailbox":"phuket","sender":"ar@katathani.com"}');
alter table ar_private.mail_deliveries enable trigger ar_preserve_sent_manifest;
alter table public.ar_sent_events add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak'));
alter table public.ar_sent_events drop constraint ar_sent_events_gmail_id_key,add unique(owner,mailbox,gmail_id);
alter table ar_private.reviewed_sent_matches add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak'));
alter table ar_private.reviewed_sent_matches drop constraint reviewed_sent_matches_gmail_id_key,add unique(owner,mailbox,gmail_id);
create function ar_private.gmail_receipt_mailbox() returns trigger language plpgsql set search_path='' as $$
begin
 select mailbox into new.mailbox from ar_private.mail_deliveries where id=new.delivery_id and owner=new.owner;
 if new.mailbox is null then raise exception 'email_mailbox_invalid';end if;return new;
end$$;
create trigger gmail_sent_mailbox before insert on public.ar_sent_events for each row execute function ar_private.gmail_receipt_mailbox();
create trigger gmail_reviewed_mailbox before insert on ar_private.reviewed_sent_matches for each row execute function ar_private.gmail_receipt_mailbox();
create function ar_private.gmail_delivery_mailbox() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='INSERT' then
 new.mailbox:=new.snapshot#>>'{expected,mailbox}';
 if new.snapshot#>>'{expected,sender}' is distinct from ar_private.gmail_sender(new.mailbox) or ar_private.gmail_sender(new.mailbox) is null then raise exception 'email_mailbox_invalid';end if;
 elsif row(new.mailbox,new.snapshot#>>'{expected,mailbox}',new.snapshot#>>'{expected,sender}') is distinct from row(old.mailbox,old.snapshot#>>'{expected,mailbox}',old.snapshot#>>'{expected,sender}') then raise exception 'email_mailbox_immutable';end if;return new;
end$$;
create trigger gmail_delivery_mailbox before insert or update on ar_private.mail_deliveries for each row execute function ar_private.gmail_delivery_mailbox();
create or replace function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text;region text;source_id text;existing ar_private.mail_deliveries;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 if jsonb_typeof(p_expected) is distinct from 'object' or ar_private.gmail_sender(p_expected->>'mailbox') is null or p_expected->>'sender' is distinct from ar_private.gmail_sender(p_expected->>'mailbox') then return jsonb_build_object('error','email_mailbox_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into existing from ar_private.mail_deliveries where id=p_id and owner=p_actor;
 if found and (existing.mailbox is distinct from p_expected->>'mailbox' or existing.snapshot#>>'{expected,sender}' is distinct from p_expected->>'sender') then return jsonb_build_object('error','email_test_command_conflict');end if;
 if p_draft is not null then select hotel into h from public.ar_email_drafts where id=p_draft and owner=p_actor for update;if not found then return jsonb_build_object('error','email_missing');end if;region:=ar_private.gmail_hotel_mailbox(h);end if;
 source_id:=p_expected#>>'{supplementalSource,draftId}';
 if source_id is not null then
 if source_id!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('error','email_mailbox_invalid');end if;
 select hotel into h from public.ar_email_drafts where id=source_id::uuid and owner=p_actor for share;
 if not found or region is not null and region is distinct from ar_private.gmail_hotel_mailbox(h) then return jsonb_build_object('error','email_mailbox_invalid');end if;region:=ar_private.gmail_hotel_mailbox(h);
 end if;
 if p_expected?'signatureHotel' then
 h:=p_expected->>'signatureHotel';if ar_private.gmail_hotel_mailbox(h) is null or region is not null and region is distinct from ar_private.gmail_hotel_mailbox(h) then return jsonb_build_object('error','email_mailbox_invalid');end if;region:=ar_private.gmail_hotel_mailbox(h);
 end if;
 source_id:=p_expected->>'replyToDeliveryId';
 if source_id is not null then
 if source_id!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('error','email_mailbox_invalid');end if;
 select mailbox into h from ar_private.mail_deliveries where id=source_id::uuid and owner=p_actor;
 if not found or region is not null and region is distinct from h then return jsonb_build_object('error','email_mailbox_invalid');end if;region:=h;
 end if;
 if region is not null and region is distinct from p_expected->>'mailbox' then return jsonb_build_object('error','email_mailbox_invalid');end if;
 return ar_private.mail_claim_before_region_delivery(p_actor,p_id,p_draft,p_revision,p_mode,p_stage,p_message_id,p_expected);
end$$;
-- Remove only the obsolete regional fences. Guarded definitions retain staff authorization and CAS/locking.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.ar_access_authorize(uuid,text,text,text,uuid,boolean,text,text)'::regprocedure);
 needle:=$n$if p_mail and not scoped<@array['KAT','TSK']::text[] then raise exception 'email_region_disabled';end if;$n$;
 if strpos(definition,needle)=0 then raise exception 'gmail_access_fence_definition_changed';end if;execute replace(definition,needle,'');
 definition:=pg_get_functiondef('public.ar_email_save_v3(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb,jsonb)'::regprocedure);
 needle:=$n$if d.hotel not in('KAT','TSK') then return jsonb_build_object('error','email_region_disabled');end if;$n$;
 if strpos(definition,needle)=0 then raise exception 'gmail_save_fence_definition_changed';end if;execute replace(definition,needle,'');
 -- Review duplicate detection must use the frozen mailbox as well as provider id.
 definition:=pg_get_functiondef('public.ar_mail_reviewed_sent(uuid,uuid,text,timestamptz,text,text)'::regprocedure);
 needle:='state=''sent'' and gmail_id=p_gmail_id';if strpos(definition,needle)=0 then raise exception 'gmail_review_definition_changed';end if;definition:=replace(definition,needle,needle||' and mailbox=d.mailbox');
 needle:='delivery_id<>p_id and gmail_id=p_gmail_id';if strpos(definition,needle)=0 then raise exception 'gmail_review_definition_changed';end if;execute replace(definition,needle,needle||' and owner=p_actor and mailbox=d.mailbox');
end$$;
create function public.ar_mail_test_conversations_region(p_actor uuid,p_offset integer,p_mailbox text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;total integer;begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 if not ar_private.gmail_region_access(p_actor,p_mailbox) then return jsonb_build_object('error','email_forbidden');end if;
 if p_offset is null or p_offset<0 or ar_private.gmail_sender(p_mailbox) is null then return jsonb_build_object('error','email_invalid');end if;
 select count(*) into total from ar_private.mail_deliveries where owner=p_actor and mailbox=p_mailbox and mode='test' and state='sent' and draft_id is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sentAt',sent_at,'subject',snapshot#>>'{expected,subject}') order by sent_at desc,id desc),'[]') into rows from(select id,sent_at,snapshot from ar_private.mail_deliveries where owner=p_actor and mailbox=p_mailbox and mode='test' and state='sent' and draft_id is null order by sent_at desc,id desc limit 20 offset p_offset)page;
 return jsonb_build_object('deliveries',rows,'nextOffset',case when p_offset+20<total then p_offset+20 else null end);
end$$;
create function public.ar_recovery_sent_match_region(p_actor uuid,p_rows jsonb,p_mailbox text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;result jsonb:='[]';d ar_private.mail_deliveries;target uuid;matches integer;receipt jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','operations_forbidden');end if;
 if not ar_private.gmail_region_access(p_actor,p_mailbox) then return jsonb_build_object('error','operations_forbidden');end if;
 if ar_private.gmail_sender(p_mailbox) is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>50 then return jsonb_build_object('error','operations_invalid');end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 if r->>'deliveryId' is not null and r->>'deliveryId'!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(r->>'gmailId','')!~'^[A-Za-z0-9_-]{1,200}$' then return jsonb_build_object('error','operations_invalid');end if;
 target:=(r->>'deliveryId')::uuid;d:=null;
 if target is not null then select * into d from ar_private.mail_deliveries where id=target and owner=p_actor and mailbox=p_mailbox;matches:=case when found then 1 else 0 end;
 else
 select count(*) into matches from ar_private.mail_deliveries where owner=p_actor and mailbox=p_mailbox and (gmail_id=r->>'gmailId' or provider_receipt_id=r->>'gmailId');
 if matches>1 then result:=result||jsonb_build_array(jsonb_build_object('deliveryId',null,'gmailId',r->>'gmailId','state','marker_conflict'));continue;end if;
 select * into d from ar_private.mail_deliveries where owner=p_actor and mailbox=p_mailbox and (gmail_id=r->>'gmailId' or provider_receipt_id=r->>'gmailId');target:=d.id;
 end if;
 if matches=0 and p_mailbox='phuket' then
 select count(*) into matches from ar_private.acceptance_sessions s cross join lateral jsonb_array_elements(coalesce(s.summary->'receipts','[]')) x where s.owner=p_actor and s.state='complete' and coalesce(x->>'mailbox','phuket')='phuket' and x->>'gmailId'=r->>'gmailId' and (r->>'deliveryId' is null or x->>'deliveryId'=r->>'deliveryId');
 if matches=1 then
 select x into receipt from ar_private.acceptance_sessions s cross join lateral jsonb_array_elements(coalesce(s.summary->'receipts','[]')) x where s.owner=p_actor and s.state='complete' and coalesce(x->>'mailbox','phuket')='phuket' and x->>'gmailId'=r->>'gmailId' and (r->>'deliveryId' is null or x->>'deliveryId'=r->>'deliveryId');
 result:=result||jsonb_build_array(jsonb_build_object('deliveryId',receipt->>'deliveryId','gmailId',r->>'gmailId','sentAt',r->>'sentAt','state','isolated_test','matchedBy','sealed_test_receipt'));continue;end if;matches:=0;
 end if;
 if matches=0 and r->>'deliveryId' is null then continue;end if;
 result:=result||jsonb_build_array(jsonb_build_object('deliveryId',target,'gmailId',r->>'gmailId','sentAt',r->>'sentAt','state',case when matches=0 then 'missing_receipt' when d.state='sent' and d.gmail_id=r->>'gmailId' then 'recorded' else 'needs_reconciliation' end,'mode',d.mode,'matchedBy',case when r->>'deliveryId' is null then 'saved_provider_id' else 'ar_marker' end));
 end loop;return result;
end$$;
create or replace function public.ar_recovery_sent_match(p_actor uuid,p_rows jsonb) returns jsonb language sql security definer set search_path='' as $$select public.ar_recovery_sent_match_region(p_actor,p_rows,'phuket')$$;
create or replace function public.ar_mail_test_conversations(p_actor uuid,p_offset integer) returns jsonb language sql stable security definer set search_path='' as $$select public.ar_mail_test_conversations_region(p_actor,p_offset,'phuket')$$;
revoke all on function ar_private.gmail_admin(uuid),ar_private.gmail_sender(text),ar_private.gmail_hotel_mailbox(text),ar_private.gmail_receipt_mailbox(),ar_private.gmail_delivery_mailbox() from public,anon,authenticated,service_role;
revoke all on function public.ar_gmail_connection_get_region(uuid,text),public.ar_gmail_connection_put_region(uuid,text,text,jsonb,text,integer,integer),public.ar_gmail_state_create_region(uuid,text,uuid,jsonb,text,integer),public.ar_mail_test_conversations_region(uuid,integer,text),public.ar_recovery_sent_match_region(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.ar_gmail_connection_get_region(uuid,text),public.ar_gmail_connection_put_region(uuid,text,text,jsonb,text,integer,integer),public.ar_gmail_state_create_region(uuid,text,uuid,jsonb,text,integer),public.ar_mail_test_conversations_region(uuid,integer,text),public.ar_recovery_sent_match_region(uuid,jsonb,text) to service_role;




-- Thread participant validation uses the sender derived from the draft's hotel.
-- Keep one-argument legacy helpers for isolated/retired Phuket paths.
do $$declare definition text;begin
 definition:=pg_get_functiondef('ar_private.valid_thread_choice(jsonb)'::regprocedure);
 definition:=replace(definition,'valid_thread_choice(v jsonb)','valid_thread_choice(v jsonb, p_sender text)');
 definition:=replace(definition,$n$e='ar@katathani.com'$n$,'e=p_sender');
 definition:=replace(definition,'begin',E'begin\n if p_sender not in(''ar@katathani.com'',''ar@thesandskhaolak.com'') or p_sender is null then return false;end if;');execute definition;
 definition:=pg_get_functiondef('ar_private.thread_participant_overlap(jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'thread_participant_overlap(v jsonb, recipients jsonb)','thread_participant_overlap(v jsonb, recipients jsonb, p_sender text)');
 definition:=replace(definition,$n$m<>'ar@katathani.com'$n$,'m<>p_sender');execute definition;
end$$;
alter table ar_private.email_thread_choices add column mailbox text not null default 'phuket' check(mailbox in('phuket','khao-lak'));
alter table ar_private.email_thread_choices drop constraint email_thread_choices_choice_check,add check(ar_private.valid_thread_choice(choice,ar_private.gmail_sender(mailbox)));
create function ar_private.gmail_thread_mailbox() returns trigger language plpgsql set search_path='' as $$begin
 select ar_private.gmail_hotel_mailbox(hotel) into new.mailbox from public.ar_email_drafts where id=new.draft_id and owner=new.owner;
 if new.mailbox is null then raise exception 'email_mailbox_invalid';end if;return new;
end$$;
create trigger gmail_thread_mailbox before insert or update on ar_private.email_thread_choices for each row execute function ar_private.gmail_thread_mailbox();
do $$declare definition text;fn regprocedure;changed integer:=0;needle text;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','ar_private') and p.prokind='f' and (p.prosrc like '%ar_private.thread_participant_overlap(%' or p.prosrc like '%ar_private.valid_thread_choice(p_choice)%') loop
 definition:=pg_get_functiondef(fn);
 if strpos(definition,'ar_private.valid_thread_choice(p_choice)')>0 then
 needle:=$n$if p_choice is not null and not ar_private.valid_thread_choice(p_choice) then return jsonb_build_object('error','email_thread_invalid');end if;$n$;
 if strpos(definition,needle)=0 then raise exception 'gmail_thread_choice_definition_changed';end if;
 definition:=replace(definition,needle,'');
 needle:=$n$if not found then return jsonb_build_object('error','email_missing');end if;$n$;
 if strpos(definition,needle)=0 then raise exception 'gmail_thread_choice_definition_changed';end if;
 definition:=replace(definition,needle,needle||E'\n if p_choice is not null and not ar_private.valid_thread_choice(p_choice,ar_private.gmail_sender(ar_private.gmail_hotel_mailbox(d.hotel))) then return jsonb_build_object(''error'',''email_thread_invalid'');end if;');
 end if;
 definition:=replace(definition,'ar_private.thread_participant_overlap(p_choice,d.recipients)','ar_private.thread_participant_overlap(p_choice,d.recipients,ar_private.gmail_sender(ar_private.gmail_hotel_mailbox(d.hotel)))');
 definition:=replace(definition,'ar_private.thread_participant_overlap(t,p_recipients)','ar_private.thread_participant_overlap(t,p_recipients,ar_private.gmail_sender(ar_private.gmail_hotel_mailbox(d.hotel)))');
 definition:=replace(definition,'ar_private.thread_participant_overlap(t,d.recipients)','ar_private.thread_participant_overlap(t,d.recipients,ar_private.gmail_sender(ar_private.gmail_hotel_mailbox(d.hotel)))');
 execute definition;changed:=changed+1;
 end loop;
 if changed<>3 then raise exception 'gmail_thread_callers_definition_changed';end if;
end$$;
revoke all on function ar_private.valid_thread_choice(jsonb,text),ar_private.thread_participant_overlap(jsonb,jsonb,text),ar_private.gmail_thread_mailbox() from public,anon,authenticated,service_role;



