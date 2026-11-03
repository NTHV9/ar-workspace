-- Synthetic TSUN storage/region/access contracts only. No provider mutations.
begin;
do $$
declare scope text:='SYNTH-TSUN-'||gen_random_uuid();definition text;f record;
begin
 if not ar_private.is_supported_hotel('TSUN') then raise exception 'tsun_not_supported';end if;
 if ar_private.is_supported_hotel('SUN') or ar_private.is_supported_hotel('LFS') then raise exception 'tsun_alias_leaked_to_operational_identity';end if;
 if ar_private.report_scope_hotels('KhaoLak')<>array['TLKL','WAKL','TLFO','TSAN','TSUN'] or ar_private.report_scope_hotels(null)<>array['KAT','TSK']
  or ar_private.report_scope_hotels('TSUN')<>array['TSUN'] or ar_private.hotel_in_report_scope('TSUN','Phuket') then raise exception 'tsun_report_region_invalid';end if;
 if ar_private.access_hotels(array['khao-lak'])<>array['TLKL','WAKL','TLFO','TSAN','TSUN'] or ar_private.access_hotels(array['phuket'])<>array['KAT','TSK']
  or ar_private.access_hotels(array['phuket','khao-lak'])<>array['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN'] then raise exception 'tsun_access_region_invalid';end if;
 if ar_private.gmail_hotel_mailbox('TSUN') is distinct from 'khao-lak' or ar_private.gmail_hotel_mailbox('SUN') is not null then raise exception 'tsun_mailbox_invalid';end if;
 if not exists(select 1 from public.ar_refresh_state where hotel='TSUN') or not exists(select 1 from ar_private.dashboard_capture_state where hotel='TSUN') then raise exception 'tsun_setup_state_missing';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('TSUN',scope,'Synthetic same account','SYNTHETIC',107,0,1),('TSAN',scope,'Synthetic same account','SYNTHETIC',214,0,1);
 if (select count(*) from public.ar_accounts where id=scope)<>2 or (select open from public.ar_accounts where hotel='TSUN' and id=scope)<>107 then raise exception 'tsun_account_identity_merged';end if;
 for f in select n.nspname,p.proname,p.oid,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','ar_private') and p.prokind='f' loop
  definition:=pg_get_functiondef(f.oid);
  if strpos(definition,$needle$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[]$needle$)>0 then raise exception 'tsun_lock_registry_stale:%',f.proname;end if;
 end loop;
 definition:=pg_get_functiondef('public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure);
 if strpos(definition,$needle$when 'TSUN' then 'TSUN'$needle$)=0 then raise exception 'tsun_append_property_unmapped';end if;
 if strpos(definition,$needle$r->>'hotel'=candidate->>'hotel' and r->>'accountNo'=s->>'accountNo'$needle$)=0 then raise exception 'tsun_append_alias_scope_widened';end if;
 if has_function_privilege('anon','public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.ar_tracker_append_prepare(uuid,text,uuid,uuid,jsonb,text,jsonb)','EXECUTE') then raise exception 'tsun_append_acl_widened';end if;
end $$;
-- Exercise the real source -> candidate -> prepare boundary. Synthetic Sent
-- receipts qualify the date; no email or Sheet call is performed by this SQL.
do $$
declare actor uuid;scope text:='SYNTH-TSUN-APPEND-'||gen_random_uuid();lease uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();
 p timestamptz:=now()-interval '1 hour';d date:=current_date;schema jsonb;c jsonb;res jsonb;v jsonb;plan jsonb;fresh jsonb;job jsonb;k text;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 schema:='[{"label":"0-30","start":0,"end":30,"sequence":1,"amount":100,"debit":100,"credit":0},{"label":"31-60","start":31,"end":60,"sequence":2,"amount":0,"debit":0,"credit":0},{"label":"61-90","start":61,"end":90,"sequence":3,"amount":0,"debit":0,"credit":0},{"label":"91-120","start":91,"end":120,"sequence":4,"amount":0,"debit":0,"credit":0},{"label":"121-150","start":121,"end":150,"sequence":5,"amount":0,"debit":0,"credit":0},{"label":"151+","start":151,"end":null,"sequence":6,"amount":0,"debit":0,"credit":0}]';
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,currency,business_date,verification_state,synced_at,"agingBuckets")
 values('TSUN',scope,'0001','Synthetic TSUN append','SYNTHETIC',100,0,1,'THB',d,'verified',p,schema);
 update public.ar_refresh_state set last_success_at=p where hotel='TSUN';
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_tsun_tracker_123456',0);
 update ar_private.tracker_bindings set enabled=true,bootstrap_confirmed=true,version='synthetic-v1',last_success_at=now(),last_error=null,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('TSUN',scope,'1','SYNTH-I-1','SYNTH-F-1',d-10,100,100,10,'verified','standalone',false,p);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='TSUN' and account_id=scope and invoice_id='1';
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
 values(delivery,actor,'send','synthetic-'||delivery,'{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}}','sent','synthetic-'||delivery,p);
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,sent_at,gmail_id,open_at_send)
 values(delivery,actor,'TSUN',scope,array['1'],'billing',p,'synthetic-'||delivery,100);
 perform public.ar_tracker_append_policy_set(actor,'khao-lak',true);
 res:=public.ar_tracker_append_candidates(actor,'khao-lak',lease);
 select x into c from jsonb_array_elements(res->'jobs')x where x->>'accountId'=scope and x->>'invoiceId'='1';
 if c is null or c->>'hotel'<>'TSUN' or c->'desiredDates'->>'R'<>(p at time zone 'Asia/Bangkok')::date::text then raise exception 'tsun_actual_sent_candidate_missing';end if;
 k:='TSUN|Synthetic Agent|I:SYNTH-I-1|1';
 v:=jsonb_build_array('TSUN','Synthetic Agent','0001',c->'sourceRow'->'guest','SYNTH-I-1','SYNTH-F-1',d-10,100,100,0,0,0,0,0,10,'0-30','🟢 ปกติ',c->'desiredDates'->'R',30,
  jsonb_build_object('formula','=IF(AND(ISNUMBER(INDEX(R:R,ROW())),ISNUMBER(INDEX(S:S,ROW()))),INDEX(R:R,ROW())+INDEX(S:S,ROW()),"")'),null,null,null,null,null,null,null,null,null,d,d,'ใหม่วันนี้',k);
 plan:=jsonb_build_object('rowKey',k,'agent','Synthetic Agent','metadataId',ar_private.tracker_append_metadata(k),'providerVersion','synthetic-v1','values',v);
 fresh:=jsonb_build_array(jsonb_build_object('hotel','TSAN','property','SAN','agent','Synthetic Agent','accountNo','0001','invoiceNo','OTHER','rowKey','SAN|Synthetic Agent|I:OTHER|1'));
 begin perform public.ar_tracker_append_prepare(actor,'khao-lak',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);raise exception 'tsun_borrowed_other_hotel_alias';
 exception when others then if sqlerrm<>'tracker_append_alias_unverified' then raise;end if;end;
 fresh:=jsonb_build_array(jsonb_build_object('hotel','TSUN','property','TSUN','agent','Synthetic Agent','accountNo','OTHER','invoiceNo','OTHER','rowKey','TSUN|Synthetic Agent|I:OTHER|1'));
 begin perform public.ar_tracker_append_prepare(actor,'khao-lak',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);raise exception 'tsun_borrowed_other_account_alias';
 exception when others then if sqlerrm<>'tracker_append_alias_unverified' then raise;end if;end;
 fresh:=jsonb_build_array(jsonb_build_object('hotel','TSUN','property','SUN','agent','Synthetic Agent','accountNo','0001','invoiceNo','OTHER','rowKey','SUN|Synthetic Agent|I:OTHER|1'));
 job:=public.ar_tracker_append_prepare(actor,'khao-lak',lease,(c->>'id')::uuid,plan,c->>'sourceHash',fresh);
 if job->>'state'<>'pending' or job->>'hotel'<>'TSUN' or job->'plan'->'values'->>0<>'TSUN' or job->'plan'->>'rowKey'<>k then raise exception 'tsun_append_not_canonical';end if;
end $$;
rollback;
