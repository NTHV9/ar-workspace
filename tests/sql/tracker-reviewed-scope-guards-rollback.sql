begin;
create function pg_temp.scope_export(p_actor uuid,p_job uuid,p_ids jsonb) returns jsonb language plpgsql as $$
declare k text:='jobs/'||p_job||'/exports/'||gen_random_uuid()||'.pdf';begin
 perform public.ar_document_begin_upload(p_actor,p_job,k,100,repeat('b',64));
 perform public.ar_document_register_upload(p_job,k,100,repeat('b',64),'application/pdf');
 return jsonb_build_array(jsonb_build_object('name','Same visible name.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))||case when p_ids is null then '{}'::jsonb else jsonb_build_object('invoice_ids',p_ids) end);
end$$;
create function pg_temp.scope_seed(p_hotel text,p_ids jsonb) returns jsonb language plpgsql as $$
declare actor uuid:=ar_private.access_owner();scope text:='SYNTH-SCOPE-GUARD-'||gen_random_uuid();j jsonb;d jsonb;e jsonb;f record;begin
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(p_hotel,scope,'Synthetic coverage','SYNTHETIC',100,0,4,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select p_hotel,scope,id,id,'F-'||id,current_date,amount,amount,'verified','standalone',false,now() from (values('a',10),('b',20),('c',30),('d',40)) x(id,amount);
 perform public.ar_settings_save_v2(actor,p_hotel,scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),p_hotel,scope,array['a','b','c','d'],'invoices','combined','billing','native');
 for f in select * from public.ar_document_files where job_id=(j->>'id')::uuid loop
  perform public.ar_document_claim_file((j->>'id')::uuid,f.id);perform public.ar_document_finish_file((j->>'id')::uuid,f.id,'jobs/'||(j->>'id')||'/originals/'||f.id||'.pdf',100,repeat('a',64));
 end loop;
 e:=pg_temp.scope_export(actor,(j->>'id')::uuid,p_ids);
 j:=public.ar_document_review(actor,(j->>'id')::uuid,0,e,true);
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);
 if d?'error' then raise exception 'scope seed open failed: %',d;end if;
 return jsonb_build_object('job',j,'draft',d,'actor',actor);
end$$;
do $$
declare s jsonb;j jsonb;d jsonb;e jsonb;v jsonb;r jsonb;expected jsonb;actor uuid;mid uuid;members jsonb:='[]';prep uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();h text;
 content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Synthetic scopes","body":"Synthetic only","richBody":null,"signatureHotel":"KAT"}';
begin
 -- Legacy receipts remain readable, but cannot authorize a new provider POST.
 s:=pg_temp.scope_seed('KAT',null);j:=s->'job';d:=s->'draft';actor:=(s->>'actor')::uuid;
 expected:=jsonb_build_object('recipients',d->'recipients','subject',d->>'subject','body',d->>'body','richBody',d->'rich_body','thread',d->'thread','mailbox','phuket','sender','ar@katathani.com');
 mid:=gen_random_uuid();r:=public.ar_mail_claim(actor,mid,(d->>'id')::uuid,0,'send',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);
 if r->>'error' is distinct from 'email_package_changed' or exists(select 1 from ar_private.mail_deliveries where id=mid) then raise exception 'Unknown scope admitted a new send: %',r;end if;
 for v in select value from jsonb_array_elements('[null,{},[3],["foreign"],["a","a"]]'::jsonb) loop
  e:=jsonb_set(j->'exports','{0,invoice_ids}',v);
  begin perform public.ar_document_review(actor,(j->>'id')::uuid,1,e,true);raise exception 'Malformed/foreign scope accepted';
  exception when others then if sqlerrm<>'document_export_invalid' then raise;end if;end;
 end loop;
 -- Reconﬁrming through the existing direct handoff preserves working text,
 -- replaces scope and repeats idempotently after a lost response.
 update public.ar_email_drafts set body='Keep this message' where id=(d->>'id')::uuid;
 e:=pg_temp.scope_export(actor,(j->>'id')::uuid,'["b","c"]');
 j:=public.ar_document_review(actor,(j->>'id')::uuid,1,e,true);
 r:=public.ar_email_rebind(actor,(d->>'id')::uuid,0,(j->>'id')::uuid,2,12582912);
 if r->'invoice_ids' is distinct from '["b","c"]'::jsonb or r->>'body'<>'Keep this message' or r->>'revision'<>'1' then raise exception 'Rebind lost current scope/text: %',r;end if;
 if public.ar_email_rebind(actor,(d->>'id')::uuid,0,(j->>'id')::uuid,2,12582912) is distinct from r then raise exception 'Rebind replay changed the revision';end if;
 -- Each combined member retains its own coverage even with the same invoice IDs
 -- and visible filenames in different Hotels.
 foreach h in array array['KAT','TSK'] loop
  s:=pg_temp.scope_seed(h,case when h='KAT' then '["b","c"]'::jsonb else '["c","d"]'::jsonb end);j:=s->'job';d:=s->'draft';
  members:=members||jsonb_build_array(jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',null,'policyVersion',null));
 end loop;
 r:=public.ar_combined_email_save(actor,prep,0,gen_random_uuid(),members,content);
 if r->>'revision' is distinct from '1' or r#>'{members,0,invoiceIds}' is distinct from '["b","c"]'::jsonb or r#>'{members,1,invoiceIds}' is distinct from '["c","d"]'::jsonb then raise exception 'Combined coverage was expanded: %',r;end if;
 expected:=content||jsonb_build_object('mailbox','phuket','sender','ar@katathani.com');
 r:=public.ar_combined_mail_claim(actor,delivery,prep,1,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',expected);
 if r->>'claimed' is distinct from 'true' then raise exception 'Scoped combined claim failed: %',r;end if;
 if not exists(select 1 from ar_private.combined_delivery_members where delivery_id=delivery and hotel='KAT' and invoice_ids=array['b','c'] and jsonb_array_length(manifest)=2 and jsonb_array_length(workflow)=2)
 or not exists(select 1 from ar_private.combined_delivery_members where delivery_id=delivery and hotel='TSK' and invoice_ids=array['c','d'] and jsonb_array_length(manifest)=2 and jsonb_array_length(workflow)=2) then raise exception 'Combined frozen member facts exceed delivered scope';end if;
 perform public.ar_mail_record(actor,delivery,'awaiting_evidence','synthetic-scoped-combined',null,null);
 r:=public.ar_mail_confirm_sent(actor,delivery,'synthetic-scoped-combined',now());
 if r->>'state' is distinct from 'sent' then raise exception 'Scoped combined confirmation failed: %',r;end if;
 if (select count(*) from ar_private.combined_sent_scopes where delivery_id=delivery)<>2 or not exists(select 1 from ar_private.combined_sent_scopes where delivery_id=delivery and hotel='KAT' and open_at_send=50) or not exists(select 1 from ar_private.combined_sent_scopes where delivery_id=delivery and hotel='TSK' and open_at_send=70) then raise exception 'Combined Sent totals include unexported invoices';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',(select account_id from ar_private.combined_delivery_members where delivery_id=delivery and hotel='KAT'),'email_records');
 if r#>>'{rows,0,invoice_count}' is distinct from '2' or r#>'{rows,0,invoice_ids}' is distinct from '["b","c"]'::jsonb then raise exception 'Combined email history expanded the member scope: %',r;end if;
end$$;
rollback;
