begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-DOC-QUEUE-'||gen_random_uuid();old_cmd uuid:=gen_random_uuid();new_cmd uuid:=gen_random_uuid();legacy jsonb;fresh jsonb;r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic document queue','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','Synthetic guest','INV-A','FOL-A',current_date,100,100,'verified','standalone',false,now());
 legacy:=public.ar_document_create_v2(actor,old_cmd,'KAT',scope,array['A'],'invoices','combined','billing','native');
 if legacy->>'execution_queue'<>'refresh' then raise exception 'legacy route changed';end if;
 r:=public.ar_document_create_v3(actor,old_cmd,'KAT',scope,array['A'],'invoices','combined','billing','native');if r->>'id'<>legacy->>'id' or r->>'execution_queue'<>'refresh' then raise exception 'replayed old command moved queue';end if;
 r:=public.ar_document_create_v3(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');if r->>'id'<>legacy->>'id' or r->>'execution_queue'<>'refresh' then raise exception 'joined active request moved queue';end if;
 fresh:=public.ar_document_create_v3(actor,new_cmd,'KAT',scope,array['A'],'statement','combined','billing','workspace');if fresh->>'execution_queue'<>'documents' or fresh->>'id'=legacy->>'id' then raise exception 'new request not isolated';end if;
 r:=public.ar_document_create_v3(actor,new_cmd,'KAT',scope,array['A'],'statement','combined','billing','workspace');if r->>'id'<>fresh->>'id' or r->>'execution_queue'<>'documents' then raise exception 'new replay moved queue';end if;
 if current_setting('ar.document_queue',true)='documents' then raise exception 'routing context leaked';end if;
 begin update public.ar_document_jobs set execution_queue='refresh' where id=(fresh->>'id')::uuid;raise exception 'queue mutable';exception when others then if sqlerrm<>'document_execution_queue_immutable' then raise;end if;end;
 if has_function_privilege('authenticated','public.ar_document_create_v3(uuid,uuid,text,text,text[],text,text,text,text)','execute') then raise exception 'queue RPC client access';end if;
end$$;
rollback;
select 'Dedicated document queue, old/new replay and active join immutability passed; rolled back' as result;
