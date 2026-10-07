begin;
do $$
declare actor uuid;other uuid:=gen_random_uuid();scope text:='SYNTH-CONFLICT-PAGE';r jsonb;next_time timestamptz;next_id uuid;seen uuid[]:='{}';entry jsonb;n integer;total integer:=0;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into ar_private.tracker_bindings(region,owner,file_id) values('phuket',actor,'SYNTH-CONFLICT-PAGE-PHUKET'),('khao-lak',actor,'SYNTH-CONFLICT-PAGE-KHAOLAK') on conflict(region) do nothing;
 insert into ar_private.tracker_rows(region,row_key,hotel,identity,locator,sheet_values) select 'phuket',scope||'-'||g,'KAT','{}','{}','{}' from generate_series(1,124)g;
 insert into ar_private.tracker_rows(region,row_key,hotel,identity,locator,sheet_values) values('khao-lak',scope||'-KH','TLKL','{}','{}','{}');
 insert into ar_private.tracker_conflicts(id,region,row_key,field,reason,created_at)
 select ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'phuket',scope||'-'||g,case when g<=60 then 'identity' when g<=120 then case when g%3=0 then 'AA' when g%3=1 then 'S' else 'T' end when g=121 then 'R' when g=122 then 'U' else 'Z' end,'synthetic-review',timestamptz '2026-10-06 09:00:00.123456+00'+case when g<=120 then interval '0' else interval '0.000001 seconds' end from generate_series(1,124)g;
 insert into ar_private.tracker_conflicts(region,row_key,field,reason,created_at) values('khao-lak',scope||'-KH','W','synthetic-review','2026-10-06 09:00:00.123456+00');
 update ar_private.tracker_conflicts set status='resolved' where region='phuket' and row_key=scope||'-124';
 r:=public.ar_tracker_conflicts_page(actor,'phuket','all',null,null);
 if r->'counts'<>jsonb_build_object('all',123,'dates',2,'references',60,'identity',60,'other',1) or jsonb_array_length(r->'rows')<>50 or r->'next' is null then raise exception 'initial categories/page count';end if;
 loop
  r:=public.ar_tracker_conflicts_page(actor,'phuket','all',next_time,next_id);
  for entry in select value from jsonb_array_elements(r->'rows') loop
   if (entry->>'id')::uuid=any(seen) then raise exception 'duplicate across cursor pages';end if;seen:=array_append(seen,(entry->>'id')::uuid);total:=total+1;
  end loop;
  exit when r->'next'='null'::jsonb;
  if r->'next'->>'createdAt' !~ '\.123456Z$' then raise exception 'PostgreSQL microseconds lost';end if;
  next_time:=(r->'next'->>'createdAt')::timestamptz;next_id:=(r->'next'->>'id')::uuid;
 end loop;
 if total<>123 or not ('10000000-0000-4000-8000-000000000121'::uuid=any(seen)) or not ('10000000-0000-4000-8000-000000000122'::uuid=any(seen)) then raise exception 'late dates unreachable';end if;
 r:=public.ar_tracker_conflicts_page(actor,'phuket','dates',null,null);if jsonb_array_length(r->'rows')<>2 or r->'rows'->0->>'field'<>'R' or r->'rows'->1->>'field'<>'U' or r->'next'<>'null'::jsonb then raise exception 'date filter';end if;
 r:=public.ar_tracker_conflicts_page(actor,'phuket','references',null,null);if jsonb_array_length(r->'rows')<>50 or r->'counts'->>'references'<>'60' then raise exception 'reference filter';end if;
 r:=public.ar_tracker_conflicts_page(actor,'khao-lak','all',null,null);if jsonb_array_length(r->'rows')<>1 or r->'rows'->0->>'field'<>'W' then raise exception 'regional leak';end if;
 begin perform public.ar_tracker_conflicts_page(other,'phuket','all',null,null);raise exception 'foreign actor admitted';exception when others then if sqlerrm='foreign actor admitted' then raise;end if;end;
 begin perform public.ar_tracker_conflicts_page(actor,'phuket','bad',null,null);raise exception 'invalid category admitted';exception when others then if sqlerrm='invalid category admitted' then raise;end if;end;
 begin perform public.ar_tracker_conflicts_page(actor,'phuket','all',now(),null);raise exception 'partial cursor admitted';exception when others then if sqlerrm='partial cursor admitted' then raise;end if;end;
 if has_function_privilege('authenticated','public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid)','EXECUTE') or has_function_privilege('anon','public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid)','EXECUTE') or not has_function_privilege('service_role','public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid)','EXECUTE') then raise exception 'RPC execution roles changed';end if;
end $$;
rollback;
