begin;
do $$
declare actor uuid; scope text:='SYNTHETIC-SOURCE-'||gen_random_uuid(); j jsonb; replay jsonb; cmd uuid:=gen_random_uuid(); before_count bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved actor missing'; end if;
 select count(*) into before_count from public.ar_document_jobs;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic source policy','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'A','Synthetic guest','INV-A','FOL-A',current_date,100,100,'verified','standalone',false,now());
 begin
  perform public.ar_document_create_v2(actor,gen_random_uuid(),'KAT',scope,array['A'],'statement','combined','billing','native');
  raise exception 'native Statement accepted';
 exception when others then if sqlerrm<>'document_statement_source_retired' then raise; end if; end;
 j:=public.ar_document_create_v2(actor,cmd,'KAT',scope,array['A'],'both','statement_bundle','billing','workspace');
 if j->>'statement_source'<>'workspace' or jsonb_array_length(j->'files')<>2 then raise exception 'workspace package invalid'; end if;
 replay:=public.ar_document_create_v2(actor,cmd,'KAT',scope,array['A'],'both','statement_bundle','billing','workspace');
 if replay->>'id'<>j->>'id' then raise exception 'duplicate source job'; end if;
 j:=public.ar_document_create(actor,gen_random_uuid(),'KAT',scope,array['A'],'statement','combined','billing');
 if j->>'statement_source'<>'workspace' then raise exception 'older source RPC bypass'; end if;
 j:=public.ar_document_create_v2(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');
 if j->>'statement_source'<>'native' or jsonb_array_length(j->'files')<>1 then raise exception 'Invoice source changed'; end if;
 if (select count(*) from public.ar_document_jobs)<>before_count+3 then raise exception 'source command duplicated'; end if;
 if has_function_privilege('authenticated','public.ar_document_create_v2(uuid,uuid,text,text,text[],text,text,text,text)','execute')
 or has_function_privilege('anon','public.ar_document_create(uuid,uuid,text,text,text[],text,text,text)','execute')
 or has_function_privilege('service_role','ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)','execute') then raise exception 'source policy bypass privilege'; end if;
end $$;
rollback;
select 'Statement source, native Invoice, replay and permission tests passed; rolled back' as result;
