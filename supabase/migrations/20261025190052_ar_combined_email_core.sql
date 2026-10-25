-- One real provider message, independently frozen Account scopes.
create table ar_private.combined_email_preparations(
 id uuid primary key, owner uuid not null references auth.users(id),revision integer not null check(revision>0),
 members jsonb not null check(jsonb_typeof(members)='array'),content jsonb not null,mailbox text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table ar_private.combined_email_commands(
 owner uuid not null,command_id uuid not null,preparation_id uuid not null references ar_private.combined_email_preparations(id),request_digest text not null,result_revision integer not null,result jsonb not null,primary key(owner,command_id));
alter table ar_private.mail_deliveries add column combined_preparation_id uuid references ar_private.combined_email_preparations(id),add column combined_preparation_revision integer,
 add check(combined_preparation_id is null and combined_preparation_revision is null or combined_preparation_id is not null and combined_preparation_revision>0 and mode='send' and draft_id is null);
create unique index combined_delivery_preparation on ar_private.mail_deliveries(combined_preparation_id) where combined_preparation_id is not null;
create table ar_private.combined_delivery_members(
 delivery_id uuid not null references ar_private.mail_deliveries(id),member_id text not null,owner uuid not null,document_job_id uuid not null references public.ar_document_jobs(id),draft_id uuid not null references public.ar_email_drafts(id),document_revision integer not null,draft_revision integer not null,
 hotel text not null,account_id text not null,invoice_ids text[] not null,purpose text not null,stage text,collection_policy_version integer,stage_snapshot jsonb,manifest jsonb not null,workflow jsonb not null,member_snapshot jsonb not null,
 primary key(delivery_id,member_id),unique(delivery_id,draft_id));
create table ar_private.combined_sent_scopes(
 delivery_id uuid not null,member_id text not null,owner uuid not null,hotel text not null,account_id text not null,invoice_ids text[] not null,purpose text not null,stage text,collection_policy_version integer,stage_snapshot jsonb,sent_at timestamptz not null,gmail_id text not null,open_at_send numeric not null,mailbox text not null,staff_actor uuid,staff_name text,
 primary key(delivery_id,member_id),foreign key(delivery_id,member_id) references ar_private.combined_delivery_members(delivery_id,member_id));
create table ar_private.combined_sent_reconciliations(
 delivery_id uuid not null,member_id text not null,hotel text not null,account_id text not null,invoice_id text not null,
 admitted_workflow jsonb not null,current_workflow jsonb,reason text not null check(reason in('applied','workflow_changed','workflow_missing')),projection_applied boolean not null,sent_at timestamptz not null,recorded_at timestamptz not null default now(),
 primary key(delivery_id,member_id,invoice_id),foreign key(delivery_id,member_id) references ar_private.combined_delivery_members(delivery_id,member_id));
alter table ar_private.combined_sent_reconciliations enable row level security;
revoke all on ar_private.combined_sent_reconciliations from public,anon,authenticated,service_role;
create view ar_private.sent_scope_facts as
 select e.delivery_id,e.owner,e.hotel,e.account_id,e.invoice_ids,e.purpose,e.stage,e.sent_at,e.gmail_id,e.open_at_send,m.mailbox,m.staff_actor,m.staff_name,e.collection_policy_version,e.stage_snapshot,
 null::text member_id,null::uuid combined_preparation_id,m.draft_id,d.document_job_id,d.document_revision,m.revision draft_revision,m.snapshot->'manifest' manifest,m.snapshot->'workflow' workflow
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id left join public.ar_email_drafts d on d.id=m.draft_id
 union all
 select s.delivery_id,s.owner,s.hotel,s.account_id,s.invoice_ids,s.purpose,s.stage,s.sent_at,s.gmail_id,s.open_at_send,s.mailbox,s.staff_actor,s.staff_name,s.collection_policy_version,s.stage_snapshot,
 s.member_id,m.combined_preparation_id,b.draft_id,b.document_job_id,b.document_revision,b.draft_revision,b.manifest,b.workflow
 from ar_private.combined_sent_scopes s join ar_private.mail_deliveries m on m.id=s.delivery_id join ar_private.combined_delivery_members b using(delivery_id,member_id);

-- This adapter uses the installed ordinary send admission, with all its current
-- source/policy/hold checks, in a rolled-back subtransaction. No provider action
-- occurs in SQL and no synthetic delivery or downstream side effect survives.
create function ar_private.combined_export_receipts(p_exports jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('storage_key',value->'storage_key','sha256',value->'sha256','byte_count',value->'byte_count') order by ordinality),'[]') from jsonb_array_elements(p_exports) with ordinality;
$$;
revoke all on function ar_private.combined_export_receipts(jsonb) from public,anon,authenticated,service_role;
-- Mail attachment display names preserve staff choices; only equal names need
-- readable Account context. Storage receipts and internal file IDs are unchanged.
create function ar_private.combined_fit_file_name(p_name text,p_prefix text default '',p_suffix integer default null) returns text language plpgsql immutable set search_path='' as $$
declare base text;extension text;stem text;prefix text;tail text;candidate text;units integer;
begin
 base:=regexp_replace(coalesce(nullif(p_name,''),'Document.pdf'),'[[:cntrl:]<>:"/\\|?*]','_','g');
 extension:=coalesce(substring(base from '([.][A-Za-z0-9]{1,10})$'),'');stem:=left(base,length(base)-length(extension));
 prefix:=left(btrim(regexp_replace(coalesce(p_prefix,''),'[[:cntrl:]<>:"/\\|?*]','_','g')),80);
 if prefix<>'' then prefix:=prefix||' - ';end if;
 tail:=case when p_suffix>=2 then ' ('||p_suffix||')' else '' end;
 if stem='' then stem:='Document';end if;
 loop
 candidate:=prefix||stem||tail||extension;
 select coalesce(sum(case when ascii(substr(candidate,n,1))>65535 then 2 else 1 end),0) into units from generate_series(1,length(candidate)) n;
 if units<=200 then return candidate;end if;
 if length(stem)>1 then stem:=left(stem,length(stem)-1);else prefix:=left(prefix,greatest(length(prefix)-1,0));end if;
 end loop;
end$$;
create function ar_private.combined_resolve_file_names(p_members jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:=p_members;entry record;used text[];copies integer;candidate text;context text;key text;suffix integer;
begin
 -- Reserve unique names first, so a contextual duplicate cannot rename or steal
 -- another staff-selected filename that was already unique in the whole email.
 select coalesce(array_agg(k),'{}'::text[]) into used from(
 select lower(normalize(ar_private.combined_fit_file_name(f->>'name'),NFC)) k from jsonb_array_elements(p_members) m cross join lateral jsonb_array_elements(m->'files') f group by 1 having count(*)=1) unique_names;
 for entry in select m.value member_json,m.ordinality-1 member_index,f.ordinality-1 file_index,ar_private.combined_fit_file_name(f.value->>'name') base_name
 from jsonb_array_elements(p_members) with ordinality m cross join lateral jsonb_array_elements(m.value->'files') with ordinality f order by m.ordinality,f.ordinality loop
 key:=lower(normalize(entry.base_name,NFC));
 select count(*) into copies from jsonb_array_elements(p_members) m cross join lateral jsonb_array_elements(m->'files') f where lower(normalize(ar_private.combined_fit_file_name(f->>'name'),NFC))=key;
 candidate:=entry.base_name;
 if copies>1 then
 context:=(entry.member_json->>'hotel')||case when btrim(coalesce(entry.member_json->>'accountName',''))<>'' then ' '||btrim(entry.member_json->>'accountName') else '' end;
 candidate:=ar_private.combined_fit_file_name(entry.base_name,context);suffix:=2;
 while lower(normalize(candidate,NFC))=any(used) loop candidate:=ar_private.combined_fit_file_name(entry.base_name,context,suffix);suffix:=suffix+1;end loop;
 used:=array_append(used,lower(normalize(candidate,NFC)));
 end if;
 result:=jsonb_set(result,array[entry.member_index::text,'files',entry.file_index::text,'name'],to_jsonb(candidate),false);
 end loop;
 return result;
end$$;
revoke all on function ar_private.combined_fit_file_name(text,text,integer),ar_private.combined_resolve_file_names(jsonb) from public,anon,authenticated,service_role;
create function ar_private.combined_validate_member(p_actor uuid,p_member jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d public.ar_email_drafts;j public.ar_document_jobs;v jsonb;expected jsonb;probe uuid:=gen_random_uuid();blocked text;files jsonb;policy integer;stage jsonb;key text;
begin
 if jsonb_typeof(p_member) is distinct from 'object' or not p_member ?& array['memberId','documentJobId','documentRevision','draftId','draftRevision','stage','policyVersion'] or coalesce(p_member->>'memberId','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or exists(select 1 from jsonb_object_keys(p_member) x where x not in('memberId','documentJobId','documentRevision','draftId','draftRevision','stage','policyVersion')) then return jsonb_build_object('error','email_invalid');end if;
 if coalesce(p_member->>'documentJobId','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(p_member->>'draftId','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(p_member->>'documentRevision','')!~'^[0-9]{1,9}$' or coalesce(p_member->>'draftRevision','')!~'^[0-9]{1,9}$' then return jsonb_build_object('error','email_invalid');end if;
 select * into j from public.ar_document_jobs where id=(p_member->>'documentJobId')::uuid and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 select * into d from public.ar_email_drafts where id=(p_member->>'draftId')::uuid and owner=p_actor for update;
 if not found or d.document_job_id<>j.id or d.hotel<>j.hotel or d.account_id<>j.account_id or d.invoice_ids is distinct from j.invoice_ids then return jsonb_build_object('error','email_missing');end if;
 if j.closed_at is not null or j.discard_requested_at is not null or coalesce((public.ar_document_get(j.id)->>'retired')::boolean,false) or j.revision<>(p_member->>'documentRevision')::integer or d.revision<>(p_member->>'draftRevision')::integer or d.document_revision<>j.revision or not j.acknowledged or j.state<>'ready' or ar_private.combined_export_receipts(j.exports) is distinct from ar_private.combined_export_receipts(d.exports) then return jsonb_build_object('error','email_package_changed');end if;
 if not ar_private.gmail_region_access(p_actor,ar_private.gmail_hotel_mailbox(d.hotel)) then return jsonb_build_object('error','email_forbidden');end if;
 if exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts x on x.id=m.draft_id where x.document_job_id=j.id) or exists(select 1 from ar_private.gmail_draft_attempts a join public.ar_email_drafts x on x.id=a.draft_id where x.document_job_id=j.id) or exists(select 1 from ar_private.combined_delivery_members b join ar_private.mail_deliveries m on m.id=b.delivery_id where b.document_job_id=j.id) then return jsonb_build_object('error','email_handoff_pending');end if;
 if ar_private.balance_only_account(d.hotel,d.account_id) then return jsonb_build_object('error','account_balance_only');end if;
 blocked:=ar_private.invoice_exception_handoff(d.hotel,d.account_id,d.invoice_ids);if blocked is not null then return jsonb_build_object('error',blocked);end if;
 expected:=jsonb_build_object('recipients',d.recipients,'subject',d.subject,'body',d.body,'richBody',d.rich_body,'thread',(public.ar_email_get(p_actor,d.id)->'thread'),'mailbox',ar_private.gmail_hotel_mailbox(d.hotel),'sender',ar_private.gmail_sender(ar_private.gmail_hotel_mailbox(d.hotel)),'policyVersion',p_member->'policyVersion');
 begin
 v:=public.ar_mail_claim(p_actor,probe,d.id,d.revision,'send',p_member->>'stage','<'||probe||'@ar-workspace.ar-c82.workers.dev>',expected);
 raise exception using errcode='ZC001',message='rollback admission probe';
 exception when sqlstate 'ZC001' then null;
 end;
 if v?'error' then return v;end if;
 if v->>'claimed' is distinct from 'true' then return jsonb_build_object('error','email_handoff_pending');end if;
 if exists(select 1 from ar_private.mail_deliveries where id=probe) then raise exception 'combined_probe_not_rolled_back';end if;
 perform 1 from public.ar_invoice_workflow w where w.hotel=d.hotel and w.account_id=d.account_id and w.invoice_id=any(d.invoice_ids) order by w.invoice_id for update;
 if exists(select 1 from jsonb_array_elements(v#>'{snapshot,workflow}') x join public.ar_invoice_workflow w on w.hotel=d.hotel and w.account_id=d.account_id and w.invoice_id=x->>'invoice_id' where w.revision<>(x->>'revision')::integer) then return jsonb_build_object('error','email_source_changed');end if;
 select coalesce(jsonb_agg(jsonb_build_object('fileId',(p_member->>'memberId')||':'||n,'name',f->>'name','byteCount',f->'byte_count','sha256',f->'sha256') order by n),'[]') into files from (
 select value f,ordinality-1 n from jsonb_array_elements(d.exports) with ordinality
 union all select to_jsonb(a),jsonb_array_length(d.exports)+row_number() over(order by a.created_at,a.id)-1 from public.ar_email_attachments a where a.draft_id=d.id and not a.removed) x;
 return p_member||jsonb_build_object('hotel',d.hotel,'accountId',d.account_id,'accountName',d.account_name,'invoiceIds',to_jsonb(d.invoice_ids),'purpose',d.purpose,'layout',j.layout,'accountType',(select a.type from public.ar_accounts a where a.hotel=d.hotel and a.id=d.account_id),'stageLabel',v#>'{stage_snapshot,label}','files',files,'mailbox',ar_private.gmail_hotel_mailbox(d.hotel),'draft',public.ar_email_get(p_actor,d.id),'manifest',j.manifest,'workflow',v#>'{snapshot,workflow}','stage_snapshot',v->'stage_snapshot','collection_policy_version',v->'collection_policy_version');
end$$;
create function ar_private.combined_public_members(p_members jsonb) returns jsonb language sql immutable set search_path='' as $$select coalesce(jsonb_agg(value-'accountType'-'draft'-'manifest'-'workflow'-'stage_snapshot'-'collection_policy_version'-'mailbox' order by ordinality),'[]') from jsonb_array_elements(p_members) with ordinality$$;
create function public.ar_combined_email_get(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare p ar_private.combined_email_preparations;v jsonb;r jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 select * into p from ar_private.combined_email_preparations where id=p_id and owner=p_actor;if not found then return jsonb_build_object('error','email_missing');end if;
 if not ar_private.gmail_region_access(p_actor,p.mailbox) then return jsonb_build_object('error','email_forbidden');end if;
 if exists(select 1 from jsonb_array_elements(p.members) m where not exists(select 1 from public.ar_document_jobs j join public.ar_email_drafts d on d.document_job_id=j.id where j.id=(m->>'documentJobId')::uuid and d.id=(m->>'draftId')::uuid and j.owner=p_actor and d.owner=p_actor and ar_private.gmail_hotel_mailbox(j.hotel)=p.mailbox)) then return jsonb_build_object('error','email_forbidden');end if;
 select jsonb_build_object('id',m.id,'state',m.state,'mode',m.mode,'gmailAccepted',m.provider_receipt_id is not null or m.verified_sent_evidence is not null or m.state='sent','recorded',m.state='sent','reason',m.reason,'stage',null,'stageLabel',null,'sentAt',m.sent_at) into r from ar_private.mail_deliveries m where combined_preparation_id=p.id;
 return jsonb_build_object('id',p.id,'revision',p.revision,'members',ar_private.combined_public_members(p.members),'content',p.content,'mailbox',p.mailbox,'totals',jsonb_build_object('accounts',(select count(distinct (v->>'hotel',v->>'accountId')) from jsonb_array_elements(p.members) v),'invoices',(select sum(jsonb_array_length(v->'invoiceIds')) from jsonb_array_elements(p.members) v),'files',(select sum(jsonb_array_length(v->'files')) from jsonb_array_elements(p.members) v),'bytes',(select sum((f->>'byteCount')::bigint) from jsonb_array_elements(p.members) v cross join lateral jsonb_array_elements(v->'files') f)),'delivery',r);
end$$;
create function public.ar_combined_email_save(p_actor uuid,p_id uuid,p_revision integer,p_command uuid,p_members jsonb,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p ar_private.combined_email_preparations;c ar_private.combined_email_commands;digest text;v jsonb;m jsonb;derived jsonb:='[]';region text;result jsonb;total bigint;cnt integer;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 if p_id is null or p_command is null or p_revision is null or p_revision<0 or jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) not between 1 and 50 or jsonb_typeof(p_content) is distinct from 'object' then return jsonb_build_object('error','email_invalid');end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('id',p_id,'revision',p_revision,'members',p_members,'content',p_content)::text,'UTF8')),'hex');
 select * into c from ar_private.combined_email_commands where owner=p_actor and command_id=p_command;
 if found then if not ar_private.gmail_region_access(p_actor,c.result->>'mailbox') then return jsonb_build_object('error','email_forbidden');end if;if c.request_digest<>digest then return jsonb_build_object('error','email_command_conflict');end if;return c.result;end if;
 if not ar_private.valid_recipients(p_content->'recipients') or p_content->>'subject' is null or length(p_content->>'subject')>998 or p_content->>'subject'~'[\r\n]' or p_content->>'body' is null or length(p_content->>'body')>100000 or (nullif(p_content->'richBody','null') is not null and (jsonb_typeof(p_content->'richBody')<>'object' or octet_length((p_content->'richBody')::text)>500000)) or exists(select 1 from jsonb_object_keys(p_content) x where x not in('recipients','subject','body','richBody','signatureHotel')) then return jsonb_build_object('error','email_invalid');end if;
 if exists(select 1 from jsonb_array_elements(p_members) x group by x->>'memberId' having count(*)>1) then return jsonb_build_object('error','email_duplicate_scope');end if;
 select * into p from ar_private.combined_email_preparations where id=p_id for update;
 if found and p.owner<>p_actor then return jsonb_build_object('error','email_forbidden');end if;
 if p.id is null and p_revision<>0 or p.id is not null and p.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if exists(select 1 from ar_private.mail_deliveries where combined_preparation_id=p_id) then return jsonb_build_object('error','email_handoff_pending');end if;
 for m in select value from jsonb_array_elements(p_members) order by value->>'documentJobId',value->>'draftId' loop
 v:=ar_private.combined_validate_member(p_actor,m);if v?'error' then return v;end if;
 if region is not null and region<>v->>'mailbox' then return jsonb_build_object('error','email_mailbox_invalid');end if;region:=v->>'mailbox';derived:=derived||jsonb_build_array(v);
 end loop;
 if not exists(select 1 from jsonb_array_elements(derived) v where v->>'hotel'=p_content->>'signatureHotel') then return jsonb_build_object('error','email_mailbox_invalid');end if;
 if exists(select 1 from jsonb_array_elements(derived) v cross join lateral jsonb_array_elements_text(v->'invoiceIds') i group by v->>'hotel',v->>'accountId',i having count(*)>1) then return jsonb_build_object('error','email_duplicate_scope');end if;
 select count(*),coalesce(sum((f->>'byteCount')::bigint),0) into cnt,total from jsonb_array_elements(derived) v cross join lateral jsonb_array_elements(v->'files') f;
 if cnt+(case when nullif(p_content#>'{richBody,signature}','null') is not null then 1 else 0 end)>50 or total>10485760 then return jsonb_build_object('error','email_package_too_large');end if;
 -- Preserve the caller's display order after deterministic admission lock order.
 select jsonb_agg(d.value order by i.ordinality) into derived from jsonb_array_elements(p_members) with ordinality i join jsonb_array_elements(derived) d on d.value->>'memberId'=i.value->>'memberId';
 derived:=ar_private.combined_resolve_file_names(derived);
 insert into ar_private.combined_email_preparations(id,owner,revision,members,content,mailbox) values(p_id,p_actor,1,derived,p_content,region) on conflict(id) do update set revision=ar_private.combined_email_preparations.revision+1,members=excluded.members,content=excluded.content,mailbox=excluded.mailbox,updated_at=now();
 result:=public.ar_combined_email_get(p_actor,p_id);
 insert into ar_private.combined_email_commands values(p_actor,p_command,p_id,digest,(result->>'revision')::integer,result);
 return result;
end$$;
create function ar_private.combined_tracker_authority(p_hotel text,p_account text,p_invoices text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('invoiceId',i,'field',f,'generation',coalesce(c.generation,0),'exists',c.hotel is not null,'mapped',exists(select 1 from ar_private.tracker_rows r where r.hotel=p_hotel and r.account_id=p_account and r.invoice_id=i),'rowPresent',exists(select 1 from ar_private.tracker_rows r where r.hotel=p_hotel and r.account_id=p_account and r.invoice_id=i and r.present)) order by i,f),'[]')
 from unnest(p_invoices) i cross join unnest(array['R','U','V','W']) f left join ar_private.tracker_current_dates c on c.hotel=p_hotel and c.account_id=p_account and c.invoice_id=i and c.field=f;
$$;
revoke all on function ar_private.combined_tracker_authority(text,text,text[]) from public,anon,authenticated,service_role;
create function public.ar_combined_mail_claim(p_actor uuid,p_id uuid,p_preparation uuid,p_revision integer,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p ar_private.combined_email_preparations;m ar_private.mail_deliveries;v jsonb;fresh jsonb;prev jsonb;fresh_members jsonb:='[]';
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 if p_id is null then return jsonb_build_object('error','email_invalid');end if;
 select * into p from ar_private.combined_email_preparations where id=p_preparation and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if not ar_private.gmail_region_access(p_actor,p.mailbox) then return jsonb_build_object('error','email_forbidden');end if;
 if p.id is null or p.revision is distinct from p_revision or p_expected->'recipients' is distinct from p.content->'recipients' or p_expected->>'subject' is distinct from p.content->>'subject' or p_expected->>'body' is distinct from p.content->>'body' or nullif(p_expected->'richBody','null') is distinct from nullif(p.content->'richBody','null') or p_expected->>'signatureHotel' is distinct from p.content->>'signatureHotel' or p_expected->>'mailbox' is distinct from p.mailbox or p_expected->>'sender' is distinct from ar_private.gmail_sender(p.mailbox) or p_message_id is null or p_message_id !~ '^<[0-9a-f-]{36}@ar-workspace[.]ar-c82[.]workers[.]dev>$' then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into m from ar_private.mail_deliveries where id=p_id or combined_preparation_id=p.id;
 if found then
 if m.id<>p_id or m.owner<>p_actor or m.combined_preparation_id is distinct from p.id or m.combined_preparation_revision<>p_revision or m.message_id<>p_message_id or m.snapshot->'expected' is distinct from p_expected then return jsonb_build_object('error','email_command_conflict');end if;
 return to_jsonb(m)||jsonb_build_object('claimed',false);end if;
 for v in select value from jsonb_array_elements(p.members) order by value->>'documentJobId',value->>'draftId' loop
 fresh:=ar_private.combined_validate_member(p_actor,v-'accountType'-'hotel'-'accountId'-'accountName'-'invoiceIds'-'purpose'-'layout'-'stageLabel'-'files'-'mailbox'-'draft'-'manifest'-'workflow'-'stage_snapshot'-'collection_policy_version');
 if fresh?'error' then return fresh;end if;
 fresh_members:=fresh_members||jsonb_build_array(fresh);
 end loop;
 -- Resolve display names over the same complete caller-ordered scope as save.
 select jsonb_agg(f.value order by i.ordinality) into fresh_members from jsonb_array_elements(p.members) with ordinality i join jsonb_array_elements(fresh_members) f on f.value->>'memberId'=i.value->>'memberId';
 fresh_members:=ar_private.combined_resolve_file_names(fresh_members);
 if fresh_members is distinct from p.members then return jsonb_build_object('error','email_package_changed');end if;
 -- Lock every workflow in global Hotel/Account/Invoice order after job/draft locks.
 perform 1 from public.ar_invoice_workflow w where exists(select 1 from jsonb_array_elements(p.members) v where w.hotel=v->>'hotel' and w.account_id=v->>'accountId' and to_jsonb(w.invoice_id)<@(v->'invoiceIds')) order by w.hotel,w.account_id,w.invoice_id for update;
 insert into ar_private.mail_deliveries(id,owner,mode,revision,message_id,snapshot,combined_preparation_id,combined_preparation_revision)
 values(p_id,p_actor,'send',p_revision,p_message_id,jsonb_build_object('expected',p_expected,'combined',public.ar_combined_email_get(p_actor,p.id),'members',p.members),p.id,p.revision);
 for v in select value from jsonb_array_elements(p.members) loop
 insert into ar_private.combined_delivery_members(delivery_id,member_id,owner,document_job_id,draft_id,document_revision,draft_revision,hotel,account_id,invoice_ids,purpose,stage,collection_policy_version,stage_snapshot,manifest,workflow,member_snapshot)
 values(p_id,v->>'memberId',p_actor,(v->>'documentJobId')::uuid,(v->>'draftId')::uuid,(v->>'documentRevision')::integer,(v->>'draftRevision')::integer,v->>'hotel',v->>'accountId',array(select jsonb_array_elements_text(v->'invoiceIds')),v->>'purpose',v->>'stage',(v->>'collection_policy_version')::integer,nullif(v->'stage_snapshot','null'),v->'manifest',v->'workflow',v||jsonb_build_object('trackerAuthority',ar_private.combined_tracker_authority(v->>'hotel',v->>'accountId',array(select jsonb_array_elements_text(v->'invoiceIds')))));
 end loop;
 select * into m from ar_private.mail_deliveries where id=p_id;return to_jsonb(m)||jsonb_build_object('claimed',true);
end$$;

-- Keep the installed ordinary confirmation and its ACL/security metadata intact.
alter function public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz) rename to combined_prior_confirm_sent;
alter function public.combined_prior_confirm_sent(uuid,uuid,text,timestamptz) set schema ar_private;
revoke all on function ar_private.combined_prior_confirm_sent(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
create function public.ar_mail_confirm_sent(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare m ar_private.mail_deliveries;b ar_private.combined_delivery_members;prev jsonb;w public.ar_invoice_workflow;day date;total numeric;compatible boolean;why text;current_before jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if m.combined_preparation_id is null then return ar_private.combined_prior_confirm_sent(p_actor,p_id,p_gmail_id,p_sent_at);end if;
 if not ar_private.invoice_exception_actor(p_actor) or not ar_private.gmail_region_access(p_actor,m.mailbox) then return jsonb_build_object('error','email_forbidden');end if;
 if m.state='sent' then
 if m.gmail_id is distinct from p_gmail_id then return jsonb_build_object('error','email_evidence_invalid');end if;
 return jsonb_build_object('state','sent','recorded',true);end if;
 if p_gmail_id is null or p_gmail_id!~'^[A-Za-z0-9_-]{1,200}$' or p_sent_at is null or p_sent_at<m.created_at-interval '5 minutes' or p_sent_at>now()+interval '5 minutes' or (m.provider_receipt_id is distinct from p_gmail_id and m.verified_sent_evidence->>'gmailId' is distinct from p_gmail_id) then return jsonb_build_object('error','email_evidence_invalid');end if;
 if exists(select 1 from ar_private.mail_deliveries other where other.id<>p_id and other.owner=p_actor and other.mailbox=m.mailbox and other.state='sent' and other.gmail_id=p_gmail_id) or (m.verified_sent_evidence is not null and (m.verified_sent_evidence->>'sentAt')::timestamptz is distinct from p_sent_at) then return jsonb_build_object('error','email_evidence_invalid');end if;
 day:=(p_sent_at at time zone 'Asia/Bangkok')::date;
 -- Admission is immutable evidence. Current workflow edits made after provider
 -- acceptance cannot erase actual Sent facts or require rewriting staff history.
 perform 1 from public.ar_invoice_workflow w where exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=p_id and b.hotel=w.hotel and b.account_id=w.account_id and w.invoice_id=any(b.invoice_ids)) order by w.hotel,w.account_id,w.invoice_id for update;
 for b in select * from ar_private.combined_delivery_members where delivery_id=p_id order by hotel,account_id,member_id loop
 select coalesce(sum((value->>'open')::numeric),0) into total from jsonb_array_elements(b.manifest);
 insert into ar_private.combined_sent_scopes(delivery_id,member_id,owner,hotel,account_id,invoice_ids,purpose,stage,collection_policy_version,stage_snapshot,sent_at,gmail_id,open_at_send,mailbox,staff_actor,staff_name)
 values(p_id,b.member_id,p_actor,b.hotel,b.account_id,b.invoice_ids,b.purpose,b.stage,b.collection_policy_version,b.stage_snapshot,p_sent_at,p_gmail_id,total,m.mailbox,m.staff_actor,m.staff_name);
 for prev in select value from jsonb_array_elements(b.workflow) order by value->>'invoice_id' loop
 select * into w from public.ar_invoice_workflow where hotel=b.hotel and account_id=b.account_id and invoice_id=prev->>'invoice_id' for update;
 current_before:=case when found then to_jsonb(w) else null end;
 compatible:=current_before is not null and current_before=prev and w.billing_required is not null and w.credit_term is not null and (b.purpose<>'billing' or w.billing_required);
 why:=case when current_before is null then 'workflow_missing' when compatible then 'applied' else 'workflow_changed' end;
 insert into ar_private.combined_sent_reconciliations(delivery_id,member_id,hotel,account_id,invoice_id,admitted_workflow,current_workflow,reason,projection_applied,sent_at) values(p_id,b.member_id,b.hotel,b.account_id,prev->>'invoice_id',prev,current_before,why,compatible,p_sent_at);
 if not compatible then continue;end if;
 update public.ar_invoice_workflow set first_billing_date=case when b.purpose='billing' then coalesce(first_billing_date,day) else first_billing_date end,last_reminder_stage=case when b.purpose='collection' then b.stage else last_reminder_stage end,last_reminder_date=case when b.purpose='collection' then day else last_reminder_date end,last_reminder_policy_version=case when b.purpose='collection' then b.collection_policy_version else last_reminder_policy_version end,last_reminder_stage_snapshot=case when b.purpose='collection' then b.stage_snapshot else last_reminder_stage_snapshot end,revision=revision+1,updated_at=now()
 where hotel=b.hotel and account_id=b.account_id and invoice_id=prev->>'invoice_id' returning * into w;
 insert into ar_private.invoice_workflow_history values(w.hotel,w.account_id,w.invoice_id,w.revision,p_actor,to_jsonb(w)||jsonb_build_object('delivery_id',p_id,'member_id',b.member_id,'source','gmail_sent'),now());
 end loop;
 end loop;
 update ar_private.mail_deliveries set state='sent',gmail_id=p_gmail_id,sent_at=p_sent_at,reason=null where id=p_id;
 return jsonb_build_object('state','sent','recorded',true);
end$$;

-- Ordinary provider admission shares the same actor mutex and cannot reuse a
-- draft/job in a shared attempt. Draft/document writes cannot alter frozen bytes.
create function ar_private.combined_member_fence() returns trigger language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare owner_id uuid;draft uuid;job uuid;
begin
 if tg_table_name='mail_deliveries' then owner_id:=new.owner;draft:=new.draft_id;
 elsif tg_table_name='gmail_draft_attempts' then draft:=new.draft_id;select d.owner,d.document_job_id into owner_id,job from public.ar_email_drafts d where d.id=draft;
 elsif tg_table_name='ar_email_drafts' then owner_id:=old.owner;draft:=old.id;job:=old.document_job_id;
 elsif tg_table_name='ar_email_attachments' then draft:=coalesce(new.draft_id,old.draft_id);select d.owner,d.document_job_id into owner_id,job from public.ar_email_drafts d where d.id=draft;
 else owner_id:=old.owner;job:=old.id;end if;
 if owner_id is not null and not pg_try_advisory_xact_lock(hashtextextended(owner_id::text,735)) then raise exception using errcode='55P03',message='document_busy';end if;
 if exists(select 1 from ar_private.combined_delivery_members b join ar_private.mail_deliveries m on m.id=b.delivery_id where (b.draft_id=draft or b.document_job_id=job) and m.state<>'sent') then raise exception 'email_handoff_pending';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger combined_ordinary_admission before insert on ar_private.mail_deliveries for each row when(new.draft_id is not null) execute function ar_private.combined_member_fence();
create trigger combined_gmail_admission before insert on ar_private.gmail_draft_attempts for each row execute function ar_private.combined_member_fence();
create trigger combined_draft_fence before update or delete on public.ar_email_drafts for each row execute function ar_private.combined_member_fence();
create trigger combined_attachment_fence before insert or update or delete on public.ar_email_attachments for each row execute function ar_private.combined_member_fence();
create trigger combined_document_fence before update or delete on public.ar_document_jobs for each row execute function ar_private.combined_member_fence();
create function ar_private.combined_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'combined_evidence_immutable';end$$;
create trigger combined_members_immutable before update or delete on ar_private.combined_delivery_members for each row execute function ar_private.combined_immutable();
create trigger combined_reconciliation_immutable before update or delete on ar_private.combined_sent_reconciliations for each row execute function ar_private.combined_immutable();
create trigger combined_facts_immutable before update or delete on ar_private.combined_sent_scopes for each row execute function ar_private.combined_immutable();
create function ar_private.combined_preparation_guard() returns trigger language plpgsql set search_path='' as $$begin
 if exists(select 1 from ar_private.mail_deliveries where combined_preparation_id=old.id) then raise exception 'email_handoff_pending';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
create trigger combined_preparation_frozen before update or delete on ar_private.combined_email_preparations for each row execute function ar_private.combined_preparation_guard();

alter table ar_private.combined_email_preparations enable row level security;
alter table ar_private.combined_email_commands enable row level security;
alter table ar_private.combined_delivery_members enable row level security;
alter table ar_private.combined_sent_scopes enable row level security;
revoke all on ar_private.combined_email_preparations,ar_private.combined_email_commands,ar_private.combined_delivery_members,ar_private.combined_sent_scopes,ar_private.sent_scope_facts from public,anon,authenticated,service_role;
revoke all on function ar_private.combined_validate_member(uuid,jsonb),ar_private.combined_public_members(jsonb),ar_private.combined_member_fence(),ar_private.combined_immutable(),ar_private.combined_preparation_guard() from public,anon,authenticated,service_role;
revoke all on function public.ar_combined_email_get(uuid,uuid),public.ar_combined_email_save(uuid,uuid,integer,uuid,jsonb,jsonb),public.ar_combined_mail_claim(uuid,uuid,uuid,integer,text,jsonb),public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ar_combined_email_get(uuid,uuid),public.ar_combined_email_save(uuid,uuid,integer,uuid,jsonb,jsonb),public.ar_combined_mail_claim(uuid,uuid,uuid,integer,text,jsonb),public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz) to service_role;
-- Membership and root provenance remain immutable before and after confirmation.
create function ar_private.combined_root_guard() returns trigger language plpgsql set search_path='' as $$begin
 if old.combined_preparation_id is not null and (new.combined_preparation_id is distinct from old.combined_preparation_id or new.combined_preparation_revision is distinct from old.combined_preparation_revision or new.owner is distinct from old.owner or new.mode is distinct from old.mode or new.draft_id is distinct from old.draft_id or new.revision is distinct from old.revision or new.message_id is distinct from old.message_id or new.snapshot is distinct from old.snapshot or new.mailbox is distinct from old.mailbox or new.created_at is distinct from old.created_at) then raise exception 'combined_evidence_immutable';end if;
 if old.combined_preparation_id is null and new.combined_preparation_id is not null then raise exception 'combined_evidence_immutable';end if;return new;end$$;
create trigger combined_root_immutable before update on ar_private.mail_deliveries for each row execute function ar_private.combined_root_guard();
revoke all on function ar_private.combined_root_guard() from public,anon,authenticated,service_role;

-- Lock order: retention domain 61704/1439, actor admission 735, then rows.
-- Exclusive callers retain their existing mode at entry; no shared-to-exclusive
-- upgrades are introduced. Replace installed bodies rather than copying gates.
do $$
declare r record;definition text;prefix text;actor_expression text;exclusive_mode boolean;
begin
 for r in select p.oid,p.proname,p.proargnames,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname=any(array[
 'ar_document_abandon','ar_document_begin_upload','ar_document_cancel_undispatched_upload','ar_document_cleanup_candidates','ar_document_cleanup_job_candidates','ar_document_discard','ar_document_finalize_abandoned','ar_document_observe_supplemental_upload','ar_document_pending_uploads','ar_document_review',
 'ar_document_claim_file','ar_document_fail_file','ar_document_finish_file','ar_document_register_upload','ar_document_save_project',
 'ar_email_attachment_add','ar_email_attachment_add_v2','ar_email_attachment_remove','ar_email_open','ar_email_rebind','ar_email_save','ar_email_save_v2','ar_email_save_v3','ar_email_thread_select','ar_gmail_attempt_claim','ar_gmail_attempt_finish','ar_unused_preparation_retire',
 'ar_combined_email_save','ar_combined_mail_claim','ar_mail_claim','ar_mail_claim_draft_send','ar_mail_record','ar_mail_record_verified_sent','ar_mail_record_verified_review','ar_mail_confirm_sent','ar_mail_reviewed_sent']) order by p.proname loop
 if r.lanname<>'plpgsql' then raise exception 'combined_entry_language_changed: %',r.proname;end if;
 if r.proargnames[1] in('p_actor','p_owner') then actor_expression:=r.proargnames[1];
 elsif r.proargnames[1]='p_job_id' then actor_expression:='(select owner from public.ar_document_jobs where id=p_job_id)';
 else raise exception 'combined_entry_actor_changed: %',r.proname;end if;
 exclusive_mode:=r.proname=any(array['ar_document_abandon','ar_document_cleanup_candidates','ar_document_cleanup_job_candidates','ar_document_discard','ar_document_finalize_abandoned','ar_unused_preparation_retire']);
 if not exclusive_mode and (r.prosrc~'pg_advisory_xact_lock[(]61704,1439[)]' or r.prosrc~'pg_advisory_xact_lock[(]61704, 1439[)]') then raise exception 'combined_entry_exclusive_mode_changed: %',r.proname;end if;
 prefix:=E'begin\n -- combined admission entry; global domain before actor and rows.\n perform pg_advisory_xact_lock'||case when exclusive_mode then '' else '_shared' end||E'(61704,1439);\n perform pg_advisory_xact_lock(hashtextextended('||actor_expression||E'::text,735));\n';
 definition:=pg_get_functiondef(r.oid);
 if definition!~E'\\mbegin\\M' then raise exception 'combined_entry_body_changed: %',r.proname;end if;
 definition:=regexp_replace(definition,E'\\mbegin\\M',prefix,'i');execute definition;
 end loop;
end$$;
-- Current financial callers also share actor admission with mail. Capture their
-- outermost entry, including Register and tracker callers of exception commands.
-- Settings already take Hotel-domain 61704 locks: take those BEFORE retention
-- 1439 and actor 735, matching source publish's Hotel -> retention order.
do $$
declare r record;definition text;prefix text;actor_expression text;hotel_prefix text;changed integer:=0;
begin
 for r in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname=any(array['ar_invoice_exception_command','ar_invoice_register_save','ar_tracker_snapshot','ar_tracker_resolve','ar_tracker_confirm_preview','ar_settings_save_v2','ar_bulk_settings_apply']) order by p.proname loop
 if r.lanname<>'plpgsql' or r.prosrc like '%combined admission entry%' or r.prosrc like '%combined financial entry%' then raise exception 'combined_financial_entry_definition_changed: %',r.proname;end if;
 actor_expression:=case when r.proname in('ar_invoice_register_save','ar_bulk_settings_apply') then 'ar_private.access_owner()' when r.proname like 'ar_tracker_%' then 'ar_private.tracker_authorize(p_actor,p_region)' else 'p_actor' end;
 hotel_prefix:='';
 if r.proname='ar_settings_save_v2' then
  hotel_prefix:=E' perform pg_advisory_xact_lock(61704,array_position(array[''KAT'',''TSK'',''TLKL'',''WAKL'',''TLFO'',''TSAN'']::text[],p_hotel));\n';
 elsif r.proname='ar_bulk_settings_apply' then
  hotel_prefix:=E' hotels:=ar_private.bulk_settings_hotels(p_actor);\n foreach h in array hotels loop perform pg_advisory_xact_lock(61704,array_position(array[''KAT'',''TSK'',''TLKL'',''WAKL'',''TLFO'',''TSAN'']::text[],h));end loop;\n';
 end if;
 prefix:=E'begin\n -- combined financial entry; Hotel domains, retention, actor, then rows.\n'||hotel_prefix||E' perform pg_advisory_xact_lock_shared(61704,1439);\n perform pg_advisory_xact_lock(hashtextextended('||actor_expression||E'::text,735));\n';
 definition:=pg_get_functiondef(r.oid);
 if definition!~E'\\mbegin\\M' then raise exception 'combined_financial_entry_body_changed: %',r.proname;end if;
 execute regexp_replace(definition,E'\\mbegin\\M',prefix,'i');changed:=changed+1;
 end loop;
 if changed<>7 then raise exception 'combined_financial_entry_count_changed';end if;
 -- External billing takes actor 735 but has no direct, nested or trigger path
 -- to 61704. Private legacy admission helpers are reachable only through the
 -- already-normalized public mail/Gmail entries; their ACLs remain unchanged.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc~'pg_advisory_xact_lock[^;]*735' and p.prosrc not like '%combined admission entry%' and p.prosrc not like '%combined financial entry%' and p.proname<>'ar_external_billing_save') then raise exception 'combined_unreviewed_actor_entry';end if;
end$$;
