-- Explicit Account settings win; type defaults remain provisional until Account confirmation.
alter table public.ar_account_settings add column from_type_defaults boolean not null default false;
alter table public.ar_invoice_workflow add column account_setup_required boolean not null default false;
do $patch$
declare d text;r record;
begin
 d:=replace(pg_get_functiondef('public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)'::regprocedure),E'\r','');
 for r in select * from (values
 ('existing_term integer;result jsonb;','existing_term integer;existing_from_type boolean;result jsonb;'),
 ('select revision,billing_required,credit_term into existing_revision,existing_requirement,existing_term','select revision,billing_required,credit_term,from_type_defaults into existing_revision,existing_requirement,existing_term,existing_from_type'),
 ('do update set billing_required=excluded.billing_required,','do update set from_type_defaults=false,billing_required=excluded.billing_required,'),
 ('if (existing_requirement,existing_term) is distinct from (p_billing_required,p_credit_term) then','if existing_from_type or (existing_requirement,existing_term) is distinct from (p_billing_required,p_credit_term) then')
 )t(needle,replacement) loop
  if (length(d)-length(replace(d,r.needle,'')))/length(r.needle)<>1 then raise exception 'bulk_account_writer_drift';end if;d:=replace(d,r.needle,r.replacement);
 end loop;execute d;
 d:=replace(pg_get_functiondef('public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb)'::regprocedure),E'\r','');
 if position('and s.collection_instructions=collection_note then return' in d)=0 then raise exception 'bulk_settings_wrapper_drift';end if;
 execute replace(d,'and s.collection_instructions=collection_note then return','and s.collection_instructions=collection_note and not s.from_type_defaults then return');
 d:=replace(pg_get_functiondef('ar_private.apply_account_billing_rules(uuid,text,text)'::regprocedure),E'\r','');
 execute replace(replace(d,'set billing_required=s.billing_required,','set account_setup_required=s.from_type_defaults,billing_required=s.billing_required,'),'or w.rules_manually_set)','or w.rules_manually_set or w.account_setup_required is distinct from s.from_type_defaults)');
 d:=replace(pg_get_functiondef('ar_private.apply_unassigned_billing_rules(text,text,text)'::regprocedure),E'\r','');
 d:=replace(d,'set billing_required=s.billing_required,','set account_setup_required=s.from_type_defaults,billing_required=s.billing_required,');
 d:=replace(d,'(w.billing_required,w.credit_term,w.settings_revision)','(w.billing_required,w.credit_term,w.settings_revision,w.account_setup_required)');
 d:=replace(d,'then s.revision end);','then s.revision end,s.from_type_defaults);');execute d;
end $patch$;

create table ar_private.account_type_defaults(
 hotel text not null,account_type text not null check(length(account_type) between 1 and 200),
 patch jsonb not null,revision integer not null default 1,updated_by uuid not null,updated_at timestamptz not null default now(),primary key(hotel,account_type)
);
create table ar_private.account_type_defaults_history(hotel text,account_type text,revision integer,actor uuid,patch jsonb,recorded_at timestamptz not null default now(),primary key(hotel,account_type,revision));
create table ar_private.account_settings_commands(command_id uuid primary key,actor uuid not null,request_hash text not null,result jsonb not null,created_at timestamptz not null default now());
alter table ar_private.account_type_defaults enable row level security;
alter table ar_private.account_type_defaults_history enable row level security;
alter table ar_private.account_settings_commands enable row level security;
revoke all on ar_private.account_type_defaults,ar_private.account_type_defaults_history,ar_private.account_settings_commands from public,anon,authenticated,service_role;

create function ar_private.bulk_settings_hotels(p_actor uuid) returns text[] language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;
begin m:=ar_private.access_member(p_actor);if m.email is null then raise exception 'access_forbidden';end if;return ar_private.access_hotels(m.regions);end $$;

create function ar_private.valid_settings_patch(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;n numeric;
begin
 if p is null or jsonb_typeof(p)<>'object' or p='{}' or p-array['billingRequired','creditTerm','billingMethod','billingPortal','billingInstructions','collectionInstructions','billingRecipients','collectionRecipients']<>'{}' then return false;end if;
 for k,v in select * from jsonb_each(p) loop
  if k='billingRequired' and jsonb_typeof(v) not in('boolean','null') then return false;
  elsif k='creditTerm' and v<>'null' then
   if jsonb_typeof(v)<>'number' then return false;end if;n:=(v#>>'{}')::numeric;if n<>trunc(n) or n<0 or n>3650 then return false;end if;
  elsif k='billingMethod' and v<>'null' and (jsonb_typeof(v)<>'string' or (v#>>'{}') not in('email','system')) then return false;
  elsif k in('billingInstructions','collectionInstructions') and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>4000) then return false;
  elsif k in('billingRecipients','collectionRecipients') and not ar_private.valid_recipients(v) then return false;
  elsif k='billingPortal' and v<>'null' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>2048 or (v#>>'{}') !~ '^https://[^/@[:space:]]+([/?#].*)?$' or (v#>>'{}')~'\\') then return false;
  end if;
 end loop;return true;
exception when others then return false;
end $$;

create function ar_private.settings_with_patch(s jsonb,p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb;f record;
begin
 r:=jsonb_build_object('billing_required',null,'credit_term',null,'billing_method',null,'billing_portal',null,'billing_instructions','','collection_instructions','','billing_recipients',jsonb_build_object('to','[]'::jsonb,'cc','[]'::jsonb,'bcc','[]'::jsonb),'collection_recipients',jsonb_build_object('to','[]'::jsonb,'cc','[]'::jsonb,'bcc','[]'::jsonb))||coalesce(s,'{}');
 for f in select * from (values('billingRequired','billing_required'),('creditTerm','credit_term'),('billingMethod','billing_method'),('billingPortal','billing_portal'),('billingInstructions','billing_instructions'),('collectionInstructions','collection_instructions'),('billingRecipients','billing_recipients'),('collectionRecipients','collection_recipients'))t(camel,snake) loop
  if p?f.camel then r:=jsonb_set(r,array[f.snake],p->f.camel);end if;
 end loop;
 r:=jsonb_set(r,'{billing_method}',case when r->>'billing_required'='true' then coalesce(nullif(r->'billing_method','null'),to_jsonb('email'::text)) else 'null'::jsonb end);
 return r;
end $$;

create function public.ar_bulk_settings_catalog(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hotels text[];n integer;
begin
 hotels:=ar_private.bulk_settings_hotels(p_actor);
 select count(*) into n from public.ar_accounts where hotel=any(hotels);if n>5000 then return jsonb_build_object('error','bulk_settings_catalog_limit');end if;
 return jsonb_build_object('total',n,'rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',a.hotel,'accountId',a.id,'name',a.name,'accountNo',a.account_no,'type',a.type,'revision',coalesce(s.revision,0),'billingRequired',s.billing_required,'creditTerm',s.credit_term,'billingMethod',s.billing_method,'source',case when s.account_id is null then 'none' when s.from_type_defaults then 'type' else 'account' end,'invoices',(select count(*) from public.ar_invoice_workflow w where w.hotel=a.hotel and w.account_id=a.id)) order by a.hotel,a.name,a.id) from public.ar_accounts a left join public.ar_account_settings s on s.hotel=a.hotel and s.account_id=a.id where a.hotel=any(hotels)),'[]'),
 'defaults',coalesce((select jsonb_agg(jsonb_build_object('hotel',d.hotel,'type',d.account_type,'revision',d.revision,'patch',d.patch) order by d.hotel,d.account_type) from ar_private.account_type_defaults d where d.hotel=any(hotels)),'[]'));
end $$;

create function ar_private.bulk_settings_plan(p_actor uuid,p_input jsonb,p_strict boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hotels text[];p jsonb;mode text;v jsonb;a public.ar_accounts;s jsonb;next_settings jsonb;rows jsonb:='[]';targets jsonb:='[]';types jsonb:='[]';actual_ids jsonb;expected_ids jsonb;count_invoices integer;changed boolean;rule_changed boolean;changes integer:=0;invoices integer:=0;rev integer;old_patch jsonb;protected boolean;effective_patch jsonb;
begin
 hotels:=ar_private.bulk_settings_hotels(p_actor);p:=p_input->'patch';mode:=p_input->>'mode';
 if not ar_private.valid_settings_patch(p) or mode not in('accounts','types') or mode is null or jsonb_typeof(p_input->'accounts') is distinct from 'array' or jsonb_typeof(p_input->'types') is distinct from 'array' or jsonb_array_length(p_input->'accounts')>500 or jsonb_array_length(p_input->'types')>120 then raise exception 'bulk_settings_invalid';end if;
 if mode='accounts' and (jsonb_array_length(p_input->'accounts')=0 or jsonb_array_length(p_input->'types')<>0) or mode='types' and jsonb_array_length(p_input->'types')=0 then raise exception 'bulk_settings_invalid';end if;
 if (select count(*)<>count(distinct jsonb_build_array(item->>'hotel',item->>'accountId')) from jsonb_array_elements(p_input->'accounts') entries(item)) or (select count(*)<>count(distinct jsonb_build_array(item->>'hotel',item->>'type')) from jsonb_array_elements(p_input->'types') entries(item)) then raise exception 'bulk_settings_invalid';end if;
 for v in select value from jsonb_array_elements(p_input->'types') order by value->>'hotel',value->>'type' loop
  if v->>'hotel' is null or not (v->>'hotel')=any(hotels) then raise exception 'access_forbidden';end if;
  if coalesce(length(btrim(v->>'type')),0) not between 1 and 200 or coalesce((v->>'revision')::integer,-1)<0 then raise exception 'bulk_settings_invalid';end if;
  select revision,patch into rev,old_patch from ar_private.account_type_defaults where hotel=v->>'hotel' and account_type=v->>'type';
  if p_strict and coalesce(rev,0)<>(v->>'revision')::integer then raise exception 'bulk_settings_conflict';end if;
  types:=types||jsonb_build_array(jsonb_build_object('hotel',v->>'hotel','type',v->>'type','revision',coalesce(rev,0)));
 end loop;
 if mode='types' then
  select coalesce(jsonb_agg(jsonb_build_array(catalog_account.hotel,catalog_account.id) order by catalog_account.hotel,catalog_account.id),'[]') into actual_ids from public.ar_accounts catalog_account where exists(select 1 from jsonb_array_elements(types)t where t->>'hotel'=catalog_account.hotel and t->>'type'=catalog_account.type);
  select coalesce(jsonb_agg(jsonb_build_array(item->>'hotel',item->>'accountId') order by item->>'hotel',item->>'accountId'),'[]') into expected_ids from jsonb_array_elements(p_input->'accounts') entries(item);
  if p_strict and actual_ids<>expected_ids then raise exception 'bulk_settings_membership_changed';end if;
  if jsonb_array_length(actual_ids)>500 then raise exception 'bulk_settings_limit';end if;
 else
  select jsonb_agg(jsonb_build_array(item->>'hotel',item->>'accountId') order by item->>'hotel',item->>'accountId') into actual_ids from jsonb_array_elements(p_input->'accounts') entries(item);
 end if;
 for v in select value from jsonb_array_elements(actual_ids) loop
  if v->>0 is null or not (v->>0)=any(hotels) then raise exception 'access_forbidden';end if;
  select * into a from public.ar_accounts where hotel=v->>0 and id=v->>1;if not found then raise exception 'bulk_settings_account_missing';end if;
  s:=public.ar_settings_get(a.hotel,a.id);rev:=coalesce((s->>'revision')::integer,0);
  if p_strict and not exists(select 1 from jsonb_array_elements(p_input->'accounts')t where t->>'hotel'=a.hotel and t->>'accountId'=a.id and (t->>'revision')::integer=rev) then raise exception 'bulk_settings_conflict';end if;
  protected:=mode='types' and exists(select 1 from public.ar_account_settings where hotel=a.hotel and account_id=a.id and not from_type_defaults);
  effective_patch:=p;
  if mode='types' then select coalesce(d.patch,'{}')||p into effective_patch from (select 1)x left join ar_private.account_type_defaults d on d.hotel=a.hotel and d.account_type=a.type;end if;
  s:=ar_private.settings_with_patch(s,'{}');next_settings:=case when protected then s else ar_private.settings_with_patch(s,effective_patch) end;
  changed:=not protected and (next_settings<>s or mode='accounts' and s->>'from_type_defaults'='true' or mode='types' and coalesce(s->>'from_type_defaults','false')<>'true');
  rule_changed:=(s->'billing_required',s->'credit_term') is distinct from(next_settings->'billing_required',next_settings->'credit_term');
  select count(*) into count_invoices from public.ar_invoice_workflow w where w.hotel=a.hotel and w.account_id=a.id;
  if changed then changes:=changes+1;end if;if rule_changed then invoices:=invoices+count_invoices;end if;
  targets:=targets||jsonb_build_array(jsonb_build_object('hotel',a.hotel,'accountId',a.id,'revision',rev));
  rows:=rows||jsonb_build_array(jsonb_build_object('hotel',a.hotel,'accountId',a.id,'revision',rev,'name',a.name,'accountNo',a.account_no,'type',a.type,'invoices',count_invoices,'changed',changed,'protected',protected,'billingRequired',s->'billing_required','creditTerm',s->'credit_term','billingMethod',s->'billing_method','after',jsonb_build_object('billingRequired',next_settings->'billing_required','creditTerm',next_settings->'credit_term','billingMethod',next_settings->'billing_method')));
 end loop;
 return jsonb_build_object('mode',mode,'accounts',targets,'types',types,'patch',p,'rows',rows,'accountCount',jsonb_array_length(targets),'invoiceCount',invoices,'changedCount',changes,'defaultsCount',jsonb_array_length(types));
end $$;

create function public.ar_bulk_settings_preview(p_actor uuid,p_input jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return ar_private.bulk_settings_plan(p_actor,p_input,false);
exception when others then return jsonb_build_object('error',case when sqlerrm like 'bulk_settings_%' or sqlerrm='access_forbidden' then sqlerrm else 'bulk_settings_invalid' end);end $$;

create function public.ar_bulk_settings_apply(p_actor uuid,p_input jsonb,p_command uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare hotels text[];owner_id uuid;hash text;prior ar_private.account_settings_commands;plan jsonb;v jsonb;s jsonb;r jsonb;d ar_private.account_type_defaults;result jsonb;h text;
begin
 hotels:=ar_private.bulk_settings_hotels(p_actor);owner_id:=ar_private.access_owner();if p_command is null or owner_id is null then raise exception 'bulk_settings_invalid';end if;
 if exists(select 1 from jsonb_array_elements((p_input->'accounts')||(p_input->'types')) target where target->>'hotel' is null or not (target->>'hotel')=any(hotels)) then raise exception 'access_forbidden';end if;
 hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_command::text,942));
 select * into prior from ar_private.account_settings_commands where command_id=p_command;
 if found then if prior.actor<>p_actor or prior.request_hash<>hash then raise exception 'bulk_settings_command_conflict';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,735));
 foreach h in array hotels loop perform pg_advisory_xact_lock(61704,array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],h));end loop;
 plan:=ar_private.bulk_settings_plan(p_actor,p_input,true);
 for v in select value from jsonb_array_elements(plan->'types') loop
  insert into ar_private.account_type_defaults(hotel,account_type,patch,updated_by) values(v->>'hotel',v->>'type',plan->'patch',p_actor)
  on conflict(hotel,account_type) do update set patch=ar_private.account_type_defaults.patch||excluded.patch,revision=ar_private.account_type_defaults.revision+1,updated_by=p_actor,updated_at=now()
  returning * into d;
  insert into ar_private.account_type_defaults_history(hotel,account_type,revision,actor,patch) values(d.hotel,d.account_type,d.revision,p_actor,d.patch);
 end loop;
 for v in select value from jsonb_array_elements(plan->'accounts') loop
  if plan->>'mode'='types' then
   if exists(select 1 from jsonb_array_elements(plan->'rows')item where item->>'hotel'=v->>'hotel' and item->>'accountId'=v->>'accountId' and (item->>'changed')::boolean) then perform ar_private.apply_type_settings(v->>'hotel',v->>'accountId');end if;
   continue;
  end if;
  s:=ar_private.settings_with_patch(public.ar_settings_get(v->>'hotel',v->>'accountId'),plan->'patch');
  r:=public.ar_settings_save_v2(owner_id,v->>'hotel',v->>'accountId',(v->>'revision')::integer,(s->>'billing_required')::boolean,(s->>'credit_term')::integer,s->'billing_recipients',s->'collection_recipients',jsonb_build_object('billingMethod',s->'billing_method','billingPortal',s->'billing_portal','billingInstructions',s->'billing_instructions','collectionInstructions',s->'collection_instructions'));
  if r?'error' then raise exception '%',r->>'error';end if;
 end loop;
 result:=jsonb_build_object('saved',true,'accounts',plan->'accountCount','changed',plan->'changedCount','invoices',plan->'invoiceCount','defaults',plan->'defaultsCount');
 insert into ar_private.account_settings_commands(command_id,actor,request_hash,result) values(p_command,p_actor,hash,result);
 return result;
exception when others then return jsonb_build_object('error',case when sqlerrm like 'bulk_settings_%' or sqlerrm like 'settings_%' or sqlerrm='access_forbidden' then sqlerrm else 'bulk_settings_unavailable' end);end $$;

-- Provisional settings are separate from explicit Account choices.
create function ar_private.apply_type_settings(p_hotel text,p_account text) returns void language plpgsql security definer set search_path='' as $$
declare d ar_private.account_type_defaults;s jsonb;r public.ar_account_settings;
begin
 if exists(select 1 from public.ar_account_settings where hotel=p_hotel and account_id=p_account and not from_type_defaults) then return;end if;
 select defaults.* into d from ar_private.account_type_defaults defaults join public.ar_accounts a on a.hotel=defaults.hotel and a.type=defaults.account_type where a.hotel=p_hotel and a.id=p_account;if not found then return;end if;
 s:=ar_private.settings_with_patch(public.ar_settings_get(p_hotel,p_account),d.patch);
 if exists(select 1 from public.ar_account_settings old where old.hotel=p_hotel and old.account_id=p_account and old.billing_method is distinct from s->>'billing_method') and (exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts draft on draft.id=m.draft_id where draft.hotel=p_hotel and draft.account_id=p_account and m.state<>'sent') or exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts draft on draft.id=g.draft_id where draft.hotel=p_hotel and draft.account_id=p_account and g.state in('creating','created','uncertain'))) then raise exception 'settings_billing_handoff_pending';end if;
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,billing_recipients,collection_recipients,billing_method,billing_portal,billing_instructions,collection_instructions,revision,from_type_defaults)
 values(p_hotel,p_account,(s->>'billing_required')::boolean,(s->>'credit_term')::integer,s->'billing_recipients',s->'collection_recipients',s->>'billing_method',s->>'billing_portal',s->>'billing_instructions',s->>'collection_instructions',1,true)
 on conflict(hotel,account_id) do update set billing_required=excluded.billing_required,credit_term=excluded.credit_term,billing_recipients=excluded.billing_recipients,collection_recipients=excluded.collection_recipients,billing_method=excluded.billing_method,billing_portal=excluded.billing_portal,billing_instructions=excluded.billing_instructions,collection_instructions=excluded.collection_instructions,revision=public.ar_account_settings.revision+1,updated_at=now()
 where public.ar_account_settings.from_type_defaults returning * into r;
 if found then
  insert into ar_private.account_settings_history(hotel,account_id,revision,actor,settings) values(r.hotel,r.account_id,r.revision,d.updated_by,to_jsonb(r)||jsonb_build_object('inherited_type',d.account_type,'type_revision',d.revision));
  perform ar_private.apply_unassigned_billing_rules(p_hotel,p_account);
  perform ar_private.apply_account_billing_rules(d.updated_by,p_hotel,p_account);
 end if;
end $$;
create function ar_private.inherit_account_type_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin perform ar_private.apply_type_settings(new.hotel,new.id);return new;end $$;
create trigger ar_inherit_account_type_settings after insert on public.ar_accounts for each row execute function ar_private.inherit_account_type_settings();
revoke all on function ar_private.bulk_settings_hotels(uuid),ar_private.valid_settings_patch(jsonb),ar_private.settings_with_patch(jsonb,jsonb),ar_private.bulk_settings_plan(uuid,jsonb,boolean),ar_private.inherit_account_type_settings(),ar_private.apply_type_settings(text,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_bulk_settings_catalog(uuid),public.ar_bulk_settings_preview(uuid,jsonb),public.ar_bulk_settings_apply(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ar_bulk_settings_catalog(uuid),public.ar_bulk_settings_preview(uuid,jsonb),public.ar_bulk_settings_apply(uuid,jsonb,uuid) to service_role;
-- Keep the queue projection's invoker/RLS boundary, including provisional rule provenance.
create or replace view public.ar_collection_rows with (security_invoker=true) as
 select i.hotel,i.account_id,i.id,i.guest,i.invoice_no,i.folio_no,i.open,i.transaction_date,
 i.collection_role,i.collection_selectable,i.verification_state,a.name as account_name,a.type as account_type,
 case when w.invoice_id is null then null else jsonb_build_object('revision',w.revision,'billing_required',w.billing_required,'credit_term',w.credit_term,'first_billing_date',w.first_billing_date,'last_reminder_stage',w.last_reminder_stage,'last_reminder_date',w.last_reminder_date,'due_date',w.due_date,'last_reminder_policy_version',w.last_reminder_policy_version,'last_reminder_stage_snapshot',w.last_reminder_stage_snapshot,'account_setup_required',w.account_setup_required) end as workflow
 from public.ar_invoices i left join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 where i.open>0;
notify pgrst,'reload schema';
