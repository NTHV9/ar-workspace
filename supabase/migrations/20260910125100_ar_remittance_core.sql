-- New application remittance records. OPERA/workflow tables are read-only in normal routines.
create function ar_private.remittance_actor(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false));
$$;
create function ar_private.remittance_money(v numeric) returns text language sql immutable set search_path='' as $$select case when v is null then null else round(v,2)::text end$$;
create function ar_private.remittance_verified(v_state text,v_role text,v_open numeric) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v_state in('verified','cleared') and v_role in('standalone','parent') and v_open>=0 and (v_state<>'cleared' or v_open=0),false);
$$;
create table public.ar_remittances(
 id uuid primary key,owner uuid not null references auth.users(id),revision integer not null default 1 check(revision>0),
 state text not null default 'active' check(state in('active','voided')),hotel text not null check(hotel in('KAT','TSK')),account_id text not null,
 account_name text not null,account_type text not null,account_no text,
 received_date date not null,reference text not null check(length(btrim(reference)) between 1 and 200),
 source_note text not null default '' check(length(source_note)<=4000),notes text not null default '' check(length(notes)<=4000),
 reported_amount numeric(18,2) check(reported_amount>=0),void_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.ar_remittance_lines(
 record_id uuid not null references public.ar_remittances(id),invoice_id text not null,position integer not null check(position between 1 and 5000),
 snapshot jsonb not null,reported_amount numeric(18,2) check(reported_amount>=0),primary key(record_id,invoice_id)
);
create table ar_private.remittance_revisions(
 record_id uuid not null references public.ar_remittances(id),revision integer not null,actor uuid not null,
 action text not null,reason text not null,snapshot jsonb not null,recorded_at timestamptz not null default now(),primary key(record_id,revision)
);
create table ar_private.remittance_commands(
 owner uuid not null,command_id uuid not null,record_id uuid not null references public.ar_remittances(id),
 action text not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner,command_id)
);
create table ar_private.remittance_files(
 id uuid primary key,record_id uuid not null references public.ar_remittances(id),name text not null,mime text not null,
 byte_count bigint not null check(byte_count between 1 and 20971520),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),storage_key text not null unique,
 state text not null default 'pending' check(state in('pending','ready','removed')),error_code text,inspection jsonb not null default '{}',
 created_at timestamptz not null default now(),ready_at timestamptz,removed_at timestamptz
);
create table ar_private.remittance_diagnostics(
 owner uuid not null,command_id uuid not null,name text not null,mime text not null,byte_count integer not null,sha256 text not null,
 storage_key text not null unique,verified boolean not null default false,created_at timestamptz not null default now(),verified_at timestamptz,
 primary key(owner,command_id)
);
create index ar_remittances_owner_received on public.ar_remittances(owner,received_date desc,id);
create index ar_remittances_scope on public.ar_remittances(owner,hotel,account_id,state);
create index ar_remittance_files_record on ar_private.remittance_files(record_id,state);
alter table public.ar_remittances enable row level security;
alter table public.ar_remittance_lines enable row level security;
alter table ar_private.remittance_revisions enable row level security;
alter table ar_private.remittance_commands enable row level security;
alter table ar_private.remittance_files enable row level security;
alter table ar_private.remittance_diagnostics enable row level security;
revoke all on public.ar_remittances,public.ar_remittance_lines,ar_private.remittance_revisions,ar_private.remittance_commands,ar_private.remittance_files,ar_private.remittance_diagnostics from public,anon,authenticated,service_role;
grant select on public.ar_remittances,public.ar_remittance_lines to authenticated;
create policy remittance_owner_read on public.ar_remittances for select to authenticated using(owner=(select auth.uid()) and (select ar_private.is_member()));
create policy remittance_line_owner_read on public.ar_remittance_lines for select to authenticated using(exists(select 1 from public.ar_remittances r where r.id=record_id and r.owner=(select auth.uid())) and (select ar_private.is_member()));

create view ar_private.remittance_link_state as
 select r.id as record_id,r.hotel,r.account_id,l.invoice_id,l.position,l.snapshot,l.reported_amount,
 case when i.id is null then 'missing' when not ar_private.remittance_verified(i.verification_state,i.collection_role,i.open) then 'unverified' when i.open=0 then 'zero' else 'open' end as current_status,
 case when ar_private.remittance_verified(i.verification_state,i.collection_role,i.open) then i.open else null end as current_open,i.synced_at
 from public.ar_remittances r join public.ar_remittance_lines l on l.record_id=r.id
 left join public.ar_invoices i on i.hotel=r.hotel and i.account_id=r.account_id and i.id=l.invoice_id;
revoke all on ar_private.remittance_link_state from public,anon,authenticated,service_role;

create function ar_private.remittance_record_json(p_id uuid,p_details boolean default true) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state,'hotel',r.hotel,'accountId',r.account_id,'accountName',r.account_name,'accountType',r.account_type,'accountNo',r.account_no,
 'receivedDate',r.received_date,'reference',r.reference,'sourceNote',r.source_note,'notes',r.notes,'reportedAmount',ar_private.remittance_money(r.reported_amount),'allocatedAmount',ar_private.remittance_money(l.allocated),'unallocatedAmount',ar_private.remittance_money(r.reported_amount-l.allocated),
 'invoiceCount',l.total,'fileCount',f.total,'pendingFiles',f.pending,'linkedOpen',case when l.unverified=0 then ar_private.remittance_money(l.known_open) else null end,'knownLinkedOpen',ar_private.remittance_money(l.known_open),'unverifiedLines',l.unverified,
 'resolution',case when r.state='voided' then 'voided' when l.unverified>0 or l.total=0 then 'needs_review' when l.known_open>0 then 'awaiting_opera' else 'linked_zero' end,'createdAt',r.created_at,'updatedAt',r.updated_at,'voidReason',r.void_reason)
 ||case when p_details then jsonb_build_object('lines',coalesce((select jsonb_agg(jsonb_build_object('invoiceId',s.invoice_id,'reportedAmount',ar_private.remittance_money(s.reported_amount),'invoiceNo',coalesce(s.snapshot->>'invoiceNo',''),'folioNo',coalesce(s.snapshot->>'folioNo',''),'guest',coalesce(s.snapshot->>'guest',''),'currentOpen',ar_private.remittance_money(s.current_open),'currentStatus',s.current_status,'sourceVerifiedAt',s.synced_at) order by s.position) from ar_private.remittance_link_state s where s.record_id=r.id),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'mime',e.mime,'byteCount',e.byte_count,'sha256',e.sha256,'state',e.state,'error',e.error_code,'createdAt',e.created_at) order by e.created_at,e.id) from ar_private.remittance_files e where e.record_id=r.id),'[]'::jsonb)) else '{}'::jsonb end
 from public.ar_remittances r
 cross join lateral(select count(*) as total,count(*) filter(where current_open is null) as unverified,coalesce(sum(current_open),0) as known_open,coalesce(sum(reported_amount),0) as allocated from ar_private.remittance_link_state where record_id=r.id) l
 cross join lateral(select count(*) filter(where state<>'removed') as total,count(*) filter(where state='pending') as pending from ar_private.remittance_files where record_id=r.id) f
 where r.id=p_id;
$$;
create function ar_private.remittance_history_add(p_actor uuid,p_id uuid,p_action text,p_reason text) returns void language sql set search_path='' as $$
 insert into ar_private.remittance_revisions(record_id,revision,actor,action,reason,snapshot) select id,revision,p_actor,p_action,p_reason,ar_private.remittance_record_json(id,true) from public.ar_remittances where id=p_id and owner=p_actor;
$$;
create function ar_private.remittance_command_result(p_actor uuid,p_command uuid,p_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare c ar_private.remittance_commands;
begin
 select * into c from ar_private.remittance_commands where owner=p_actor and command_id=p_command;
 if not found then return null;end if;
 if c.record_id<>p_id or c.action<>p_action or c.input is distinct from p_input then return jsonb_build_object('error','remittance_command_conflict');end if;
 return c.result;
end $$;
create function ar_private.remittance_command_store(p_actor uuid,p_command uuid,p_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r jsonb;
begin
 r:=ar_private.remittance_record_json(p_id,true);
 insert into ar_private.remittance_commands(owner,command_id,record_id,action,input,result) values(p_actor,p_command,p_id,p_action,p_input,r);return r;
end $$;
create function ar_private.remittance_immutable_history() returns trigger language plpgsql set search_path='' as $$begin raise exception 'remittance_history_immutable';end$$;
create trigger ar_remittance_history_immutable before update or delete on ar_private.remittance_revisions for each row execute function ar_private.remittance_immutable_history();
revoke all on function ar_private.remittance_actor(uuid),ar_private.remittance_money(numeric),ar_private.remittance_verified(text,text,numeric),ar_private.remittance_record_json(uuid,boolean),ar_private.remittance_history_add(uuid,uuid,text,text),ar_private.remittance_command_result(uuid,uuid,uuid,text,jsonb),ar_private.remittance_command_store(uuid,uuid,uuid,text,jsonb),ar_private.remittance_immutable_history() from public,anon,authenticated,service_role;

create function public.ar_remittance_get(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if not exists(select 1 from public.ar_remittances where id=p_id and owner=p_actor) then return null;end if;
 return ar_private.remittance_record_json(p_id,true);
end $$;
create function public.ar_remittance_history(p_actor uuid,p_id uuid,p_offset integer,p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;total integer;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','remittance_invalid');end if;
 if not exists(select 1 from public.ar_remittances where id=p_id and owner=p_actor) then return jsonb_build_object('error','remittance_missing');end if;
 select count(*) into total from ar_private.remittance_revisions where record_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('revision',h.revision,'action',h.action,'reason',h.reason,'recordedAt',h.recorded_at,'snapshot',h.snapshot) order by h.revision desc),'[]') into rows
 from(select * from ar_private.remittance_revisions where record_id=p_id order by revision desc limit p_limit offset p_offset) h;
 return jsonb_build_object('rows',rows,'total',total);
end $$;
create function public.ar_remittance_list(p_actor uuid,p_filters jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_view text;v_hotel text;v_account text;v_type text;v_search text;v_from date;v_to date;v_voided boolean;v_offset integer;v_limit integer;result jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or p_filters-array['view','hotel','accountId','type','search','from','to','includeVoided','offset','limit']<>'{}'::jsonb then return jsonb_build_object('error','remittance_invalid');end if;
 v_view:=coalesce(p_filters->>'view','pending');v_hotel:=nullif(p_filters->>'hotel','');v_account:=nullif(p_filters->>'accountId','');v_type:=nullif(p_filters->>'type','');v_search:=coalesce(p_filters->>'search','');
 v_offset:=coalesce((p_filters->>'offset')::integer,0);v_limit:=coalesce((p_filters->>'limit')::integer,50);v_voided:=coalesce((p_filters->>'includeVoided')::boolean,false);
 if v_view not in('pending','activity','all') or (v_hotel is not null and v_hotel not in('KAT','TSK')) or (v_account is not null and v_hotel is null) or v_offset<0 or v_limit not between 1 and 200 or length(v_account)>200 or length(v_type)>200 or length(v_search)>200 then return jsonb_build_object('error','remittance_invalid');end if;
 if v_view='activity' then
  if coalesce(p_filters->>'from','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_filters->>'to','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('error','remittance_invalid');end if;
  v_from:=(p_filters->>'from')::date;v_to:=(p_filters->>'to')::date;if v_from>v_to then return jsonb_build_object('error','remittance_invalid');end if;
 end if;
 with filtered as materialized(
  select r.* from public.ar_remittances r where r.owner=p_actor and (v_hotel is null or r.hotel=v_hotel) and (v_account is null or r.account_id=v_account) and (v_type is null or r.account_type=v_type)
   and (v_search='' or strpos(lower(r.reference||' '||r.account_name),lower(v_search))>0)
   and (r.state='active' or v_voided)
   and (v_view<>'activity' or r.received_date between v_from and v_to)
   and (v_view<>'pending' or (r.state='active' and (not exists(select 1 from public.ar_remittance_lines where record_id=r.id) or exists(select 1 from ar_private.remittance_link_state where record_id=r.id and current_status<>'zero'))))
 ),active_notices as materialized(select * from filtered where state='active'),
 unique_invoices as materialized(
  select distinct s.hotel,s.account_id,s.invoice_id,s.current_open,s.current_status from ar_private.remittance_link_state s join active_notices r on r.id=s.record_id
 ),notice_totals as(select count(*) as documents,count(*) filter(where reported_amount is null) as unspecified,coalesce(sum(reported_amount),0) as known_reported from active_notices),
 invoice_totals as(select count(*) as invoices,count(*) filter(where current_open is null) as unverified,coalesce(sum(current_open),0) as known_open from unique_invoices),
 page as(select id,received_date,created_at from filtered order by received_date desc,created_at desc,id limit v_limit offset v_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(ar_private.remittance_record_json(p.id,false) order by p.received_date desc,p.created_at desc,p.id) from page p),'[]'::jsonb),'total',(select count(*) from filtered),
 'summary',jsonb_build_object('documents',n.documents,'invoices',i.invoices,'reportedAmount',case when n.unspecified=0 then ar_private.remittance_money(n.known_reported) else null end,'knownReportedAmount',ar_private.remittance_money(n.known_reported),'unspecifiedAmounts',n.unspecified,'linkedOpen',case when i.unverified=0 then ar_private.remittance_money(i.known_open) else null end,'knownLinkedOpen',ar_private.remittance_money(i.known_open),'unverifiedInvoices',i.unverified)) into result from notice_totals n cross join invoice_totals i;
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('error','remittance_invalid');
end $$;
revoke all on function public.ar_remittance_get(uuid,uuid),public.ar_remittance_history(uuid,uuid,integer,integer),public.ar_remittance_list(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ar_remittance_get(uuid,uuid),public.ar_remittance_history(uuid,uuid,integer,integer),public.ar_remittance_list(uuid,jsonb) to service_role;
