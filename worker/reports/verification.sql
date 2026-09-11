-- Run only after the additive ar_activity_reports migration. Synthetic rows only;
-- all fixture writes roll back. No providers, real invoice updates or messages.
begin;
do $$
declare actor uuid;account text:='SYNTH-REPORT-'||gen_random_uuid();invoice text:='SYNTH-INVOICE';other uuid:=gen_random_uuid();delivery uuid;final_delivery uuid;result jsonb;snap jsonb;idx integer;failed boolean;before_count bigint;after_count bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'Allowed confirmed actor required';end if;
 select count(*) into before_count from public.ar_sent_events;
 if has_function_privilege('anon','public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)','execute') or has_function_privilege('authenticated','public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)','execute') then raise exception 'Reports RPC exposed to clients';end if;
 if has_table_privilege('anon','public.ar_sent_events','select') or has_table_privilege('authenticated','ar_private.report_sent_invoices','select') then raise exception 'Evidence accessible outside policy';end if;
 if not (select relrowsecurity from pg_class where oid='public.ar_sent_events'::regclass) then raise exception 'Sent event RLS disabled';end if;
 result:=public.ar_reports_read(other,'activity');if result->>'error'<>'reports_forbidden' then raise exception 'Cross actor allowed';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',account,'Synthetic report fixture','OTA',1200,200,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,invoice_no,folio_no,collection_role,compressed,verification_state) values('KAT',account,invoice,'2026-08-01',5000,1200,invoice,'SYNTH-FOLIO','standalone',false,'verified');
 -- Manual recorded stage is intentionally not a verified send.
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,last_reminder_stage='Final',last_reminder_date='2026-09-01' where hotel='KAT' and account_id=account and invoice_id=invoice;
 result:=public.ar_reports_read(actor,'current','KAT',account);
 if result->'rows'->0->>'latest_stage'<>'No verified send' or (result->'summary'->>'urgent')::int<>0 then raise exception 'Manual correction counted as send';end if;
 for idx in 1..4 loop
  delivery:=gen_random_uuid();if idx=3 then final_delivery:=delivery;end if;
  snap:=jsonb_build_object('draft',jsonb_build_object('hotel','KAT','account_id',account,'account_name','Synthetic report fixture'),
   'manifest',jsonb_build_array(jsonb_build_object('hotel','KAT','account_id',account,'id',invoice,'invoice_no',invoice,'folio_no','SYNTH-FOLIO','open',case when idx=1 then 5000 when idx=2 then 2500 else 1200 end)),
   'workflow',jsonb_build_array(jsonb_build_object('hotel','KAT','account_id',account,'invoice_id',invoice,'first_billing_date',case when idx=1 then null else '2026-09-09' end)));
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,stage,sent_at,gmail_id) values(delivery,actor,'send','<'||delivery||'@synthetic.invalid>',snap,'sent',case when idx=3 then 'Final' end,'2026-09-09 16:30:00+00'::timestamptz+(idx-1)*interval '2 hours','synthetic-'||delivery);
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',account,array[invoice],case when idx=3 then 'collection' else 'billing' end,case when idx=3 then 'Final' end,'2026-09-09 16:30:00+00'::timestamptz+(idx-1)*interval '2 hours','synthetic-'||delivery,case when idx=1 then 5000 when idx=2 then 2500 else 1200 end);
 end loop;
 -- A diagnostic confirmed send has no business event; a draft has no event either.
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(gen_random_uuid(),actor,'test','<'||gen_random_uuid()||'@synthetic.invalid>','{}','sent'),(gen_random_uuid(),actor,'draft','<'||gen_random_uuid()||'@synthetic.invalid>','{}','created');
 -- Explicit owner filtering also protects internal evidence belonging to another actor.
 delivery:=gen_random_uuid();insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(delivery,other,'send','<'||delivery||'@synthetic.invalid>',snap,'sent');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,sent_at,gmail_id,open_at_send) values(delivery,other,'KAT',account,array[invoice],'billing',now(),'synthetic-'||delivery,1200);
 result:=public.ar_reports_read(actor,'activity','KAT',account,null,null,null,1,1);
 if (result->>'total')::int<>4 or jsonb_array_length(result->'rows')<>1 or (result->'summary'->>'amount')::numeric<>9900 or (result->'summary'->>'uniqueInvoices')::int<>1 then raise exception 'Full filtered summary or pagination incorrect';end if;
 result:=public.ar_reports_read(actor,'activity','KAT',account,'OTA','2026-09-10','2026-09-10');
 if (result->>'total')::int<>3 then raise exception 'Thai actual date boundary incorrect';end if;
 result:=public.ar_reports_read(actor,'activity','KAT',account,null,null,null,0,50,null,'First billing');if (result->>'total')::int<>1 or (result->'summary'->>'amount')::numeric<>5000 then raise exception 'First billing classification incorrect';end if;
 result:=public.ar_reports_read(actor,'activity','KAT',account,null,null,null,0,50,null,'Rebilling');if (result->>'total')::int<>2 then raise exception 'Rebilling classification incorrect';end if;
 result:=public.ar_reports_read(actor,'current','KAT',account);if (result->>'total')::int<>1 or (result->'summary'->>'urgent')::int<>1 or (result->'summary'->>'amount')::numeric<>1200 then raise exception 'Current invoice stage repeated or rebilling hid Final';end if;
 update public.ar_accounts set type='Corporate',name='Changed current name' where hotel='KAT' and id=account;
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=account and id=invoice;
 result:=public.ar_reports_read(actor,'current','KAT',account);if (result->>'total')::int<>0 then raise exception 'Cleared invoice remains current';end if;
 result:=public.ar_reports_read(actor,'activity','KAT',account,'OTA');if (result->>'total')::int<>4 or (result->'summary'->>'amount')::numeric<>9900 or result->'rows'->0->>'account_name'<>'Synthetic report fixture' then raise exception 'History changed after clearing or account edit';end if;
 failed:=false;begin update public.ar_sent_events set open_at_send=0 where delivery_id=final_delivery;exception when others then if sqlerrm='sent_evidence_immutable' then failed:=true;else raise;end if;end;if not failed then raise exception 'Event mutable';end if;
 failed:=false;begin update ar_private.mail_deliveries set snapshot='{}' where id=final_delivery;exception when others then if sqlerrm='sent_evidence_immutable' then failed:=true;else raise;end if;end;if not failed then raise exception 'Sent snapshot mutable';end if;
 select count(*) into after_count from public.ar_sent_events;if after_count<>before_count+5 then raise exception 'Unexpected test writes';end if;
end $$;
rollback;
select 'reports synthetic rollback checks passed' as result;
