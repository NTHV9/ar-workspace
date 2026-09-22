begin;
do $$
declare actor uuid;other uuid:=gen_random_uuid();scope text:='SYNTHETIC-REGISTER-'||gen_random_uuid();r jsonb;original_row jsonb;input jsonb;command uuid:=gen_random_uuid();f jsonb;note_result jsonb;sheet_stamp text;today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic Register','SYNTHETIC_REGISTER',300,0,2,'verified'),('TSK',scope,'Synthetic separate hotel','SYNTHETIC_REGISTER',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'A','Synthetic guest A','2','102',today-30,100,100,'verified','standalone',false,now()),('KAT',scope,'B','Synthetic guest B','10','110',today-20,200,200,'verified','standalone',false,now()),('TSK',scope,'A','Synthetic guest TSK','2','102',today-30,100,100,'verified','standalone',false,now());
 perform public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 original_row:=public.ar_invoice_register_get(actor,'KAT',scope,'A');
 f:=jsonb_build_object('hotel','KAT','account',scope,'type',null,'search','','balance','all','visibility','visible','billing','all','tracking','all','sort','invoice_no','direction','asc','offset',0,'limit',1);
 r:=public.ar_invoice_register_read(actor,f);if r?'error' or r->>'total'<>'2' or r->'rows'->0->>'invoice_no'<>'2' then raise exception 'register read/pagination failed: %',r;end if;
 sheet_stamp:=r->>'snapshot';if sheet_stamp is null or sheet_stamp!~'^[0-9a-f]{32}$' or public.ar_invoice_register_read(actor,f||'{"offset":1}')->>'snapshot' is distinct from sheet_stamp then raise exception 'sheet signature depends on page';end if;
 r:=public.ar_invoice_register_read(actor,f||'{"direction":"desc"}');if r->'rows'->0->>'invoice_no'<>'10' then raise exception 'invoice numeric sort failed';end if;
 input:=jsonb_build_object('commandId',command,'revision',0,'workflowRevision',original_row->'workflow_revision','exceptionRevision',0,'values',ar_private.invoice_register_values(original_row)||jsonb_build_object('creditTerm',45,'firstBillingDate',today-5,'lastReminderStage','Follow 1','lastReminderDate',today-1,'promisedDate',today+5,'trackingStatus','Promised payment','ownerName','Synthetic AR staff','reportedReceived','10.00','note','Synthetic shared invoice note'));
 r:=public.ar_invoice_register_save(actor,'KAT',scope,'A',input);if r?'error' then raise exception 'register save failed: %',r;end if;
 if public.ar_invoice_register_read(actor,f)->>'snapshot' is not distinct from sheet_stamp then raise exception 'sheet signature ignored a workflow/note edit';end if;
 if r->'row'->>'due_date'<>(today+40)::text or r->'row'->>'note'<>'Synthetic shared invoice note' or r->'row'->>'open'<>'100.00' then raise exception 'workflow/note link or OPERA isolation failed';end if;
 if (select credit_term from public.ar_account_settings where hotel='KAT' and account_id=scope)<>30 or exists(select 1 from public.ar_sent_events where account_id=scope) then raise exception 'register changed default or fabricated send';end if;
 if public.ar_invoice_register_save(actor,'KAT',scope,'A',input)->>'replayed'<>'true' then raise exception 'lost save receipt';end if;
 if public.ar_invoice_register_save(actor,'KAT',scope,'A',jsonb_set(input,'{values,ownerName}','"Changed"'))->>'error'<>'register_command_conflict' then raise exception 'changed retry accepted';end if;
 if public.ar_invoice_register_save(actor,'KAT',scope,'A',jsonb_set(input,'{commandId}',to_jsonb(gen_random_uuid())))->>'error'<>'register_revision_conflict' then raise exception 'stale edit accepted';end if;
 -- Existing web history and note writers must be visible in the register.
 perform public.ar_workflow_history_save(actor,'KAT',scope,'A',(r->'row'->>'workflow_revision')::int,today-5,'Follow 2',today);
 note_result:=public.ar_invoice_exception_command(actor,'KAT',scope,'A',jsonb_build_object('commandId',gen_random_uuid(),'revision',(r->'row'->>'exception_revision')::int,'confirmed',true,'action','set_notes','reason','Synthetic reverse-link check','note','Changed in invoice details','dispute',''));
 if note_result?'error' then raise exception 'reverse note writer failed';end if;
 update public.ar_invoices set open=95,synced_at=now() where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_invoice_register_get(actor,'KAT',scope,'A');if r->>'last_reminder_stage'<>'Follow 2' or r->>'note'<>'Changed in invoice details' or r->>'open'<>'95.00' or r->>'credit_term'<>'45' or r->>'owner_name'<>'Synthetic AR staff' then raise exception 'reverse sync or refresh retention failed';end if;
 if public.ar_invoice_register_get(actor,'TSK',scope,'A')->>'note'<>'' then raise exception 'cross-hotel note write';end if;
 r:=public.ar_invoice_register_read(actor,f||'{"search":"Changed in invoice","limit":50}');if r->>'total'<>'1' then raise exception 'note search failed';end if;
 r:=public.ar_invoice_register_visibility(actor,null,jsonb_build_object('commandId',gen_random_uuid(),'hidden',true,'rows',jsonb_build_array(jsonb_build_object('hotel','KAT','accountId',scope,'invoiceId','A'))));if r?'error' then raise exception 'hide failed';end if;
 r:=public.ar_invoice_register_read(actor,f);if r->>'total'<>'1' or r->>'hiddenTotal'<>'1' or r->'rows'->0->>'id'<>'B' then raise exception 'hidden visibility failed';end if;
 r:=public.ar_invoice_register_read(actor,f||'{"visibility":"hidden"}');if r->'rows'->0->>'id'<>'A' then raise exception 'hidden recovery view failed';end if;
 r:=public.ar_invoice_register_visibility(actor,null,jsonb_build_object('commandId',gen_random_uuid(),'hidden',false,'rows',jsonb_build_array(jsonb_build_object('hotel','KAT','accountId',scope,'invoiceId','A'))));
 if public.ar_invoice_register_read(actor,f)->>'total'<>'2' then raise exception 'show row failed';end if;
 if public.ar_invoice_register_get(gen_random_uuid(),'KAT',scope,'A')->>'error'<>'register_forbidden' then raise exception 'anonymous actor accepted';end if;
 insert into ar_private.access_members(email,regions) values('synthetic-register-region@example.test',array['khao-lak']);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(other,'synthetic-register-region@example.test',now(),false);
 if public.ar_invoice_register_get(other,'KAT',scope,'A')->>'error'<>'register_forbidden' or public.ar_invoice_register_save(other,'KAT',scope,'A',input)->>'error'<>'register_forbidden' then raise exception 'regional access escaped';end if;
 if public.ar_invoice_register_history(actor,'KAT',scope,'A')->>'total'<>'1' then raise exception 'retry duplicated audit history';end if;
 if has_function_privilege('authenticated','public.ar_invoice_register_save(uuid,text,text,text,jsonb)','execute') or has_table_privilege('authenticated','ar_private.invoice_tracking','select') then raise exception 'register became public';end if;
end $$;
rollback;
