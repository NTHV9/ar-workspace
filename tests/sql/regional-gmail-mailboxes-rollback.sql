-- Synthetic provider seals only; all effects are rolled back.
begin;
do $$
declare owner_id uuid:=ar_private.access_owner();other_id uuid:=gen_random_uuid();r jsonb;ph uuid:=gen_random_uuid();kl uuid:=gen_random_uuid();wrong uuid:=gen_random_uuid();base_revision integer;first_payload jsonb;claim jsonb;
begin
 if (select snapshot#>>'{expected,sender}' from ar_private.mail_deliveries where id='10800000-0000-4000-8000-000000000001')<>'ar@katathani.com' or (select mailbox from ar_private.mail_deliveries where id='10800000-0000-4000-8000-000000000001')<>'phuket' then raise exception 'historical Khao signature provenance rewritten';end if;
 if owner_id is null then raise exception 'local synthetic owner absent';end if;
 select coalesce((select revision from ar_private.gmail_connections where owner=owner_id and mailbox='phuket'),0) into base_revision;
 first_payload:=public.ar_gmail_connection_get_region(owner_id,'phuket');
 if first_payload is not null and (first_payload->>'cipher_version'<>'1' or first_payload->>'mailbox'<>'phuket') then raise exception 'legacy marker lost';end if;
 if public.ar_gmail_connection_put_region(other_id,'khao-lak','ar@thesandskhaolak.com','{}','scope',0,2) or public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@katathani.com','{}','scope',0,2) or public.ar_gmail_connection_put_region(owner_id,'khao-lak','AR@thesandskhaolak.com','{}','scope',0,2) or public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{}','scope',0,1) then raise exception 'connection allowlist bypass';end if;
 if not public.ar_gmail_state_create_region(owner_id,'regional-state-a',null,'{}','khao-lak',0) or not public.ar_gmail_state_create_region(owner_id,'regional-state-b',null,'{}','khao-lak',0) then raise exception 'admin jobless state rejected';end if;
 r:=public.ar_gmail_state_consume('regional-state-a');if r->>'mailbox'<>'khao-lak' or r->>'connection_revision'<>'0' or r->'document_job_id'<>'null'::jsonb then raise exception 'state binding lost';end if;
 if public.ar_gmail_state_consume('regional-state-a') is not null then raise exception 'state reused';end if;
 if not public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{"synthetic":"regional"}','scope',0,2) then raise exception 'connection create rejected';end if;
 if public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{"synthetic":"old-callback"}','scope',0,2) or public.ar_gmail_state_create_region(owner_id,'regional-stale',null,'{}','khao-lak',0) then raise exception 'stale callback accepted';end if;
 if not public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{"synthetic":"refreshed"}','scope',1,2) or public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{}','scope',1,2) then raise exception 'refresh CAS failed';end if;
 if public.ar_gmail_connection_get_region(owner_id,'phuket') is distinct from first_payload then raise exception 'Phuket seal changed by Khao connection';end if;
 if public.ar_gmail_connection_put(owner_id,'ar@katathani.com','{}','scope') then raise exception 'old unversioned writer still enabled';end if;
 claim:=public.ar_mail_claim(owner_id,wrong,null,null,'test',null,'regional-wrong','{"mailbox":"khao-lak","sender":"ar@katathani.com"}');if claim->>'error'<>'email_mailbox_invalid' then raise exception 'wrong sender accepted';end if;
 claim:=public.ar_mail_claim(owner_id,wrong,null,null,'test',null,'regional-wrong','{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com","signatureHotel":"KAT"}');if claim->>'error'<>'email_mailbox_invalid' then raise exception 'signature mismatch accepted';end if;
 -- Identical provider IDs exist legitimately in independent mailboxes.
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(ph,owner_id,'test','regional-ph','{"expected":{"mailbox":"phuket","sender":"ar@katathani.com","subject":"Synthetic Phuket"}}','sent','sameProviderId',now()),(kl,owner_id,'test','regional-kl','{"expected":{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com","subject":"Synthetic KhaoLak"}}','sent','sameProviderId',now());
 r:=public.ar_recovery_sent_match_region(owner_id,'[{"gmailId":"sameProviderId"}]','khao-lak');if jsonb_array_length(r)<>1 or r->0->>'deliveryId'<>kl::text or r->0->>'state'<>'recorded' then raise exception 'provider recovery crossed mailbox';end if;
 r:=public.ar_recovery_sent_match_region(owner_id,jsonb_build_array(jsonb_build_object('gmailId','sameProviderId','deliveryId',ph)),'khao-lak');if r->0->>'state'<>'missing_receipt' then raise exception 'marker crossed mailbox';end if;
 r:=public.ar_mail_test_conversations_region(owner_id,0,'khao-lak');if not exists(select 1 from jsonb_array_elements(r->'deliveries')x where x->>'id'=kl::text) or exists(select 1 from jsonb_array_elements(r->'deliveries')x where x->>'id'=ph::text) then raise exception 'test paging crossed mailbox';end if;
 claim:=public.ar_mail_claim(owner_id,wrong,null,null,'test',null,'regional-reply','{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com"}'::jsonb||jsonb_build_object('replyToDeliveryId',ph));if claim->>'error'<>'email_mailbox_invalid' then raise exception 'reply mailbox mismatch accepted';end if;
 begin update ar_private.mail_deliveries set mailbox='phuket' where id=kl;raise exception 'frozen mailbox changed';exception when raise_exception then if sqlerrm<>'email_mailbox_immutable' then raise;end if;end;
 -- New diagnostic claims are frozen and idempotent per mailbox.
 claim:=public.ar_mail_claim(owner_id,wrong,null,null,'test',null,'<'||wrong||'@ar-workspace.ar-c82.workers.dev>','{"mailbox":"khao-lak","sender":"ar@thesandskhaolak.com","recipientHash":"synthetic","subject":"Synthetic"}');if claim->>'claimed'<>'true' or claim->>'mailbox'<>'khao-lak' then raise exception 'Khao claim rejected: %',claim;end if;
 claim:=public.ar_mail_claim(owner_id,wrong,null,null,'test',null,'<'||wrong||'@ar-workspace.ar-c82.workers.dev>','{"mailbox":"phuket","sender":"ar@katathani.com","recipientHash":"synthetic","subject":"Synthetic"}');if claim->>'error'<>'email_test_command_conflict' then raise exception 'command mailbox changed';end if;
 insert into ar_private.reviewed_sent_matches(delivery_id,owner,gmail_id,proof_hash,reason) values(ph,owner_id,'reviewSame',repeat('a',64),'Synthetic Phuket'),(kl,owner_id,'reviewSame',repeat('b',64),'Synthetic KhaoLak');
 if (select mailbox from ar_private.reviewed_sent_matches where delivery_id=kl)<>'khao-lak' then raise exception 'review audit mailbox lost';end if;
 insert into ar_private.acceptance_sessions(id,owner,state,source_sha,summary) values(gen_random_uuid(),owner_id,'complete','synthetic',jsonb_build_object('receipts',jsonb_build_array(jsonb_build_object('deliveryId',gen_random_uuid(),'gmailId','sealedOnly'))));
 if public.ar_recovery_sent_match_region(owner_id,'[{"gmailId":"sealedOnly"}]','phuket')->0->>'state'<>'isolated_test' or public.ar_recovery_sent_match_region(owner_id,'[{"gmailId":"sealedOnly"}]','khao-lak')<>'[]'::jsonb then raise exception 'sealed acceptance crossed mailbox';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('request.headers','{"x-ar-actor":"invalid"}',true);
 if public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{}','scope',2,2) or public.ar_gmail_connection_refresh_region(owner_id,'khao-lak','{}','scope',2) or public.ar_gmail_connection_get_region(owner_id,'khao-lak') is not null then raise exception 'malformed trusted actor accepted';end if;
 perform set_config('request.headers','{}',true);
 if public.ar_gmail_connection_refresh_region(owner_id,'khao-lak','{}','scope',0) or not public.ar_gmail_connection_refresh_region(owner_id,'khao-lak','{"synthetic":"refresh"}','scope',2) or public.ar_gmail_connection_refresh_region(owner_id,'khao-lak','{}','scope',2) then raise exception 'refresh-only CAS failed';end if;
 perform public.ar_access_save(owner_id,gen_random_uuid(),'regional.synthetic@example.invalid',array['khao-lak'],true,0);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(other_id,'regional.synthetic@example.invalid',now(),false);
 update ar_private.access_members set auth_user_id=other_id where email='regional.synthetic@example.invalid';
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',other_id)::text,true);
 if public.ar_gmail_connection_get_region(owner_id,'khao-lak') is null or public.ar_gmail_connection_get_region(owner_id,'phuket') is not null then raise exception 'staff regional credential read scope';end if;
 if public.ar_gmail_connection_put_region(owner_id,'khao-lak','ar@thesandskhaolak.com','{}','scope',3,2) or public.ar_gmail_state_create_region(owner_id,'staff-reconnect',null,'{}','khao-lak',3) then raise exception 'staff reconnect privilege escalation';end if;
 if not public.ar_gmail_connection_refresh_region(owner_id,'khao-lak','{"synthetic":"staff-refresh"}','scope',3) or public.ar_gmail_connection_refresh_region(owner_id,'phuket','{}','scope',base_revision) then raise exception 'staff regional refresh permissions';end if;
 r:=public.ar_mail_test_conversations_region(owner_id,0,'phuket');if r->>'error'<>'email_forbidden' then raise exception 'staff cross region conversations';end if;
 r:=public.ar_recovery_sent_match_region(owner_id,'[]','phuket');if r->>'error'<>'operations_forbidden' then raise exception 'staff cross region recovery';end if;
 perform set_config('request.headers','{}',true);
 if has_function_privilege('authenticated','public.ar_gmail_connection_get_region(uuid,text)','EXECUTE') or has_table_privilege('authenticated','ar_private.gmail_connections','SELECT') then raise exception 'private credential exposure';end if;
end$$;
do $$declare owner_id uuid:=ar_private.access_owner();jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();choice jsonb;self_choice jsonb;r jsonb;h text;
begin
 choice:='{"threadId":"thread1","parentMessageId":"message1","rfcMessageId":"<synthetic@example.invalid>","references":["<synthetic@example.invalid>"],"subject":"Synthetic thread","parentDate":"2026-09-01T00:00:00Z","matchedRecipients":["ar@katathani.com"]}';
 self_choice:=jsonb_set(choice,'{matchedRecipients}','["ar@thesandskhaolak.com"]');
 if not ar_private.valid_thread_choice(choice,'ar@thesandskhaolak.com') or ar_private.valid_thread_choice(choice,'ar@katathani.com') or ar_private.valid_thread_choice(self_choice,'ar@thesandskhaolak.com') then raise exception 'regional thread sender exclusion';end if;
 if not ar_private.thread_participant_overlap(choice,'{"to":["ar@katathani.com"],"cc":[],"bcc":[]}','ar@thesandskhaolak.com') or ar_private.thread_participant_overlap(self_choice,'{"to":["ar@thesandskhaolak.com"],"cc":[],"bcc":[]}','ar@thesandskhaolak.com') then raise exception 'regional thread recipient overlap';end if;
 foreach h in array array['TLKL','WAKL','TLFO','TSAN'] loop if ar_private.gmail_hotel_mailbox(h)<>'khao-lak' then raise exception 'Khao hotel routing';end if;end loop;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(jid,owner_id,gen_random_uuid(),'TSAN','REGIONAL-SYNTHETIC','Synthetic regional Account',array['A'],'invoices','separate','collection',jid::text,'[{"id":"A","invoice_no":"INV-A","folio_no":"FOL-A","open":100}]',100,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"synthetic","byte_count":100,"sha256":"synthetic"}]',true);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(did,owner_id,jid,1,'TSAN','REGIONAL-SYNTHETIC','Synthetic regional Account',array['A'],'collection','{"to":["ar@katathani.com"],"cc":[],"bcc":[]}','Synthetic thread','Synthetic body','[{"name":"Synthetic.pdf"}]');
 r:=public.ar_email_thread_select(owner_id,did,0,choice);if r?'error' then raise exception 'Khao thread selection rejects Phuket participant: %',r;end if;
 if (select mailbox from ar_private.email_thread_choices where draft_id=did)<>'khao-lak' then raise exception 'thread mailbox table constraint mismatch';end if;
 r:=public.ar_email_thread_select(owner_id,did,1,self_choice);if r->>'error'<>'email_thread_invalid' then raise exception 'Khao self sender accepted';end if;
 r:=public.ar_email_save_v3(owner_id,did,1,'collection','{"to":["ar@katathani.com"],"cc":[],"bcc":[]}','Synthetic thread','Synthetic body',null,null,null);if r?'error' then raise exception 'Khao thread content save rejects Phuket participant: %',r;end if;
 r:=public.ar_gmail_attempt_claim(owner_id,did,(r->>'revision')::integer,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>');if r->>'error'<>'email_region_disabled' then raise exception 'retired legacy helper opened to Khao';end if;
end$$;
rollback;




