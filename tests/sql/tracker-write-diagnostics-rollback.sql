-- Static, bounded operational metadata only. All synthetic rows roll back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-DIAGNOSTIC-'||gen_random_uuid();lease uuid:=gen_random_uuid();
 delivery uuid;q uuid;f text;d date:=(now() at time zone 'Asia/Bangkok')::date-5;
 before_workflow jsonb;before_sent bigint;result jsonb;stored jsonb;
begin
 if to_regprocedure('public.ar_tracker_write_diagnostic(uuid,text,uuid,uuid[],text,boolean,integer)') is null then raise exception 'tracker diagnostic recorder unavailable';end if;
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'SYNTH-DIAGNOSTIC','Synthetic diagnostics','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'i','SYNTH-I',d-10,100,100,'verified','standalone',false,now());
 perform public.ar_tracker_connect(actor,'phuket','synthetic_diagnostic_original_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 foreach f in array array['R','U','V','W'] loop
  delivery:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','sent','synthetic-'||delivery,(d::timestamp at time zone 'Asia/Bangkok'));
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array['i'],case when f='R' then 'billing' else 'collection' end,case f when 'U' then 'Follow 1' when 'V' then 'Follow 2' when 'W' then 'Follow 3' end,(d::timestamp at time zone 'Asia/Bangkok'),'synthetic-'||delivery,100);
  select id into strict q from ar_private.tracker_outbox where delivery_id=delivery and field=f;
  select to_jsonb(w) into before_workflow from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='i';
  select count(*) into before_sent from public.ar_sent_events;
  result:=public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q],'cas_412',true,412);
  if result->>'recorded' is distinct from '1' then raise exception 'valid diagnostic not recorded';end if;
  perform public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q],'cell_preimage_changed',false,null);
  select write_diagnostics into stored from ar_private.tracker_outbox where id=q;
  if stored->'first'->>'code' is distinct from 'cas_412' or stored->'last'->>'code' is distinct from 'cell_preimage_changed' or octet_length(stored::text)>1024 then raise exception 'diagnostic lost first cause or exceeded bound';end if;
  if before_workflow is distinct from(select to_jsonb(w) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='i') or before_sent<>(select count(*) from public.ar_sent_events) or(select open from public.ar_invoices where hotel='KAT' and account_id=scope and id='i')<>100 then raise exception 'diagnostic changed business state';end if;
 end loop;
 perform public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q],'adapter_exception_unknown',null,null);
 select write_diagnostics into stored from ar_private.tracker_outbox where id=q;
 if stored->'first'->>'code' is distinct from 'cas_412' or stored->'last'->>'code' is distinct from 'adapter_exception_unknown' or stored->'last'->'mutationStarted' is distinct from 'null'::jsonb then raise exception 'unknown adapter result was falsely classified';end if;
 begin perform public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q],'SYNTHETIC PRIVATE provider data',true,412);raise exception 'arbitrary diagnostic accepted';exception when others then if sqlerrm<>'tracker_diagnostic_invalid' then raise;end if;end;
 begin perform public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q,q],'cas_412',true,412);raise exception 'duplicate ids accepted';exception when others then if sqlerrm<>'tracker_diagnostic_invalid' then raise;end if;end;
 begin perform public.ar_tracker_write_diagnostic(actor,'phuket',lease,array[q],'cas_412',true,999);raise exception 'invalid status accepted';exception when others then if sqlerrm<>'tracker_diagnostic_invalid' then raise;end if;end;
 begin perform public.ar_tracker_write_diagnostic(actor,'phuket',gen_random_uuid(),array[q],'cas_412',true,412);raise exception 'wrong lease accepted';exception when others then if sqlerrm<>'tracker_lock_lost' then raise;end if;end;
 begin perform public.ar_tracker_write_diagnostic(actor,'khao-lak',lease,array[q],'cas_412',true,412);raise exception 'cross-region diagnostic accepted';exception when others then if sqlerrm not in('tracker_lock_lost','tracker_forbidden') then raise;end if;end;
 begin perform public.ar_tracker_write_diagnostic(gen_random_uuid(),'phuket',lease,array[q],'cas_412',true,412);raise exception 'unknown actor accepted';exception when others then if sqlerrm<>'tracker_forbidden' then raise;end if;end;
 if has_function_privilege('anon','public.ar_tracker_write_diagnostic(uuid,text,uuid,uuid[],text,boolean,integer)','execute') or has_function_privilege('authenticated','public.ar_tracker_write_diagnostic(uuid,text,uuid,uuid[],text,boolean,integer)','execute') then raise exception 'diagnostic RPC leaked public execute';end if;
end$$;
rollback;
