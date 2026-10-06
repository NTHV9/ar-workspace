-- LOCAL synthetic provenance/permission controls, all rolled back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-PROVENANCE-'||gen_random_uuid();lease uuid:=gen_random_uuid();d2 date:=(now() at time zone 'Asia/Bangkok')::date-20;kind text;rows jsonb:='[]';delivery uuid;result jsonb;preview uuid;expected boolean;observed boolean;cache_mode text;query_plan json;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state) values('KAT',scope,'0002','Synthetic provenance','SYNTHETIC',1000,0,10,'verified');
 foreach kind in array array['send','draft','test','unconfirmed','wrong-stage','other-invoice','no-history','uncorroborated','wrong-owner','anchor'] loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,kind,'00001-'||kind,'F-'||kind,d2-30,100,100,'verified','standalone',false,now());
  rows:=rows||jsonb_build_array(jsonb_build_object('rowKey','SYNTH-PROOF-'||kind,'hotel','KAT','accountNo','0002','invoiceNo','00001-'||kind,'folio','F-'||kind,'locator','{}'::jsonb,'fields',jsonb_build_object('R',(d2-10)::text,'S','30','T',(d2+20)::text,'U',null,'V',null,'W',null,'X',null,'Y',null,'Z',null,'AA',null,'AB',null,'AC',null)));
 end loop;
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'phuket','synthetic_provenance_tracker_12345',0);
 result:=public.ar_tracker_preview(actor,'phuket','synthetic_provenance_tracker_12345','synthetic-v1',repeat('a',64),rows);preview:=(result->>'previewId')::uuid;perform public.ar_tracker_confirm_preview(actor,'phuket',preview,repeat('a',64),'synthetic-v1');perform public.ar_tracker_claim(actor,'phuket',lease,true);
 cache_mode:=current_setting('plan_cache_mode');
 foreach kind in array array['send','draft','test','unconfirmed','wrong-stage','other-invoice','no-history','uncorroborated','wrong-owner'] loop
  delivery:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at,created_at) values(delivery,actor,case kind when 'draft' then 'draft' when 'test' then 'test' else 'send' end,'synthetic-provenance-'||delivery,'{}',case kind when 'unconfirmed' then 'awaiting_evidence' else 'sent' end,'synthetic-provenance-'||delivery,((case kind when 'uncorroborated' then d2-1 else d2 end)::timestamp at time zone 'Asia/Bangkok'),(d2::timestamp at time zone 'Asia/Bangkok')-interval '2 days');
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array[case kind when 'other-invoice' then 'anchor' else kind end],'collection',case kind when 'wrong-stage' then 'Follow 2' else 'Follow 1' end,((case kind when 'uncorroborated' then d2-1 else d2 end)::timestamp at time zone 'Asia/Bangkok'),'synthetic-provenance-'||delivery,100);
  if kind<>'no-history' then insert into ar_private.tracker_history(region,row_key,field,actual_date,source,actor,before_value,after_value,delivery_id) values('phuket','SYNTH-PROOF-'||kind,'U',d2,'confirmed_sent_writeback',actor,'null',to_jsonb(d2::text),delivery);end if;
  expected:=kind in('send','draft');
  observed:=ar_private.tracker_confirmed_reminder_reversion(case kind when 'wrong-owner' then gen_random_uuid() else actor end,'phuket','SYNTH-PROOF-'||kind,'KAT',scope,kind,'U',d2-1);
  if observed is distinct from expected then raise exception 'provenance control failed:%',kind;end if;
 end loop;
 if current_setting('plan_cache_mode') is distinct from cache_mode then raise exception 'provenance helper leaked caller planning setting';end if;
 if ar_private.tracker_confirmed_reminder_reversion(actor,'phuket','SYNTH-PROOF-send','KAT',scope,'send','R',d2-1) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket','SYNTH-PROOF-send','KAT',scope,'send','U',d2) or ar_private.tracker_confirmed_reminder_reversion(actor,'phuket','SYNTH-PROOF-send','KAT',scope,'send','U',null) then raise exception 'R/equal/null helper scope broadened';end if;
 if has_function_privilege('anon','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') or has_function_privilege('authenticated','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') or has_function_privilege('service_role','ar_private.tracker_confirmed_reminder_reversion(uuid,text,text,text,text,text,text,date)','execute') then raise exception 'confirmed provenance private helper exposed';end if;
 -- Growing unrelated history must not make each date scan the full ledger.
 insert into ar_private.tracker_history(region,row_key,field,source,actor,before_value,after_value)
 select 'phuket','SYNTH-PROOF-anchor','AB','synthetic_nonconfirmed',actor,'null','"synthetic irrelevant history"' from generate_series(1,3000);
 analyze ar_private.tracker_history;
 execute 'explain (format json,costs false) select h.delivery_id from ar_private.tracker_history h where h.hotel=$1 and h.account_id=$2 and h.invoice_id=$3 and h.field=$4 and h.source=''confirmed_sent_writeback'' and h.actual_date is not null and h.actual_date>$5 and h.region=$6 and h.row_key=$7' into query_plan using 'KAT',scope,'send','U',d2-1,'phuket','SYNTH-PROOF-send';
 if query_plan::text not like '%tracker_history_confirmed_reminder_lookup%' then raise exception 'confirmed history lookup lost its partial canonical index';end if;
end $$;
rollback;
