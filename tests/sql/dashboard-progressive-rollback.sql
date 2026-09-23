-- Comparison groups must equal the original stable reader, with no invented values.
begin;
do $$
declare actor uuid;d date:=(now() at time zone 'Asia/Bangkok')::date;r text;k text;x jsonb;y jsonb;i integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 if has_function_privilege('anon','public.ar_dashboard_region_segment(uuid,date,date,text,text,text)','execute')
 or has_function_privilege('authenticated','public.ar_dashboard_region_segment(uuid,date,date,text,text,text)','execute') then raise exception 'segment ACL exposed';end if;
 if public.ar_dashboard_region_segment(null,d,d,null,'phuket','entries')->>'error'<>'dashboard_forbidden' then raise exception 'actor unchecked';end if;
 if public.ar_dashboard_region_segment(actor,d,d,null,'phuket','unknown')->>'error'<>'dashboard_invalid' then raise exception 'segment unchecked';end if;
 foreach r in array array['phuket','khao-lak'] loop
  x:=public.ar_dashboard_region_overview(actor,d,d,null,r);
  foreach k in array array['balances','activity','external','entries','payments','paid'] loop
   y:=public.ar_dashboard_region_segment(actor,d,d,null,r,k);
   if y?'error' or y->'total'->k is distinct from x->'total'->k then raise exception 'segment total changed: % %',r,k;end if;
   for i in 0..jsonb_array_length(x->'hotels')-1 loop
    if y->'hotels'->i->k is distinct from x->'hotels'->i->k then raise exception 'segment hotel changed: % %',r,k;end if;
   end loop;
  end loop;
 end loop;
end $$;
rollback;
