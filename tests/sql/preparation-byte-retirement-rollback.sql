begin;
create function pg_temp.preparation_seed(p_mode text default 'send',p_state text default 'pending',p_sha text default repeat('a',64),p_bytes integer default 100) returns jsonb language plpgsql as $$
declare actor uuid:=ar_private.access_owner();jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();oid uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();scope text:='SYNTHETIC-C-'||jid;key text;exports jsonb;expected jsonb;begin
 perform set_config('ar.document_lifecycle','transient',true);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic C','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope and invoice_id='A';
 key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';exports:=jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',p_bytes,'sha256',p_sha));
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,lifecycle,acknowledged,exports)
 values(jid,actor,cmd,'KAT',scope,'Synthetic C',array['A'],'invoices','combined','billing',md5(jid::text),'[{"id":"A","open":100}]',100,'ready','transient',true,exports);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(did,actor,jid,0,'KAT',scope,'Synthetic C',array['A'],'billing','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}','Synthetic','Body',exports);
 insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256,registered) values(key,jid,p_bytes,p_sha,true);
 perform public.ar_document_register_upload(jid,key,p_bytes,p_sha,'application/pdf');
 if p_mode<>'none' then
 expected:=jsonb_build_object('mailbox','phuket','sender','ar@katathani.com','messageId','<'||mid||'@ar-workspace.ar-c82.workers.dev>','recipients','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}'::jsonb,'subject','Synthetic','body','Body','richBody',null,'files',jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','byte_count',p_bytes,'sha256',p_sha)));
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state,gmail_draft_id)
 select mid,actor,did,0,p_mode,expected->>'messageId',jsonb_build_object('expected',expected,'draft',to_jsonb(d),'manifest','[{"id":"A","open":100}]'::jsonb,'workflow',(select jsonb_agg(to_jsonb(w)) from public.ar_invoice_workflow w where w.hotel=d.hotel and w.account_id=d.account_id and w.invoice_id='A')),p_state,'syntheticDraft' from public.ar_email_drafts d where d.id=did;
 end if;
 insert into storage.objects(id,bucket_id,name,metadata) values(oid,'ar-working-files',key,jsonb_build_object('size',p_bytes));
 return jsonb_build_object('actor',actor,'job',jid,'draft',did,'mail',mid,'object',oid,'key',key,'command',cmd,'scope',scope);
end$$;
create function pg_temp.preparation_command(p_seed jsonb) returns text language plpgsql as $$declare digest text;begin
 digest:=ar_private.document_request_digest('KAT',p_seed->>'scope',array['A'],'invoices','combined','billing','workspace');
 insert into ar_private.document_commands(owner,command_key,payload,job_id,request_actor,request_digest) values((p_seed->>'actor')::uuid,(p_seed->>'command')::uuid,jsonb_build_object('hotel','KAT','account_id',p_seed->>'scope','ids',jsonb_build_array('A'),'content','invoices','layout','combined','purpose','billing','statement_source','workspace'),(p_seed->>'job')::uuid,(p_seed->>'actor')::uuid,digest);return digest;end$$;
do $$
#variable_conflict use_variable
declare actor uuid:=ar_private.access_owner();sess uuid:=gen_random_uuid();current_sess uuid:=gen_random_uuid();marker uuid:=gen_random_uuid();s jsonb;s2 jsonb;root jsonb;root_id uuid;root_mail uuid;root_expected jsonb;r jsonb;original jsonb;rid uuid;item uuid;claim uuid:=gen_random_uuid();scenario text;fid uuid;uploadkey text;before_count bigint;digest text;digest2 text;cmd uuid;other_actor uuid;other_session uuid:=gen_random_uuid();begin
 insert into auth.sessions(id,user_id,created_at) values(sess,actor,clock_timestamp()),(current_sess,actor,clock_timestamp());
 if has_function_privilege('authenticated','public.ar_document_exit(uuid,uuid,uuid,uuid,uuid,uuid)','execute') or has_function_privilege('anon','public.ar_preparation_complete(uuid,uuid)','execute') then raise exception 'C RPC ACL leak';end if;
 s:=pg_temp.preparation_seed();
 -- Existing bodyless A behavior never creates C authority.
 r:=public.ar_document_abandon(actor,(s->>'job')::uuid);if r->>'outcome'<>'protected' or ar_private.preparation_retired((s->>'job')::uuid) then raise exception 'bodyless acquired authority';end if;
 original:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess);if original->>'outcome'<>'protected' or not ar_private.preparation_retired((s->>'job')::uuid) or public.ar_document_get((s->>'job')::uuid)->>'bytes_released'<>'true' then raise exception 'marked modern pending Exit did not release: %, %',original,public.ar_document_get((s->>'job')::uuid);end if;
 if original<>public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess) then raise exception 'original Exit replay changed';end if;
 foreach scenario in array array['snapshot','draft','send','upload','rebind'] loop
 begin
 if scenario='snapshot' then update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,body}','"changed"') where id=(s->>'mail')::uuid;
 elsif scenario='draft' then update public.ar_email_drafts set body='changed' where id=(s->>'draft')::uuid;
 elsif scenario='send' then update ar_private.mail_deliveries set draft_send_claimed_at=clock_timestamp() where id=(s->>'mail')::uuid;
 elsif scenario='upload' then perform public.ar_document_begin_upload(actor,(s->>'job')::uuid,'jobs/'||(s->>'job')||'/exports/'||gen_random_uuid()||'.pdf',100,repeat('a',64));
 else update public.ar_email_drafts set exports='[]' where id=(s->>'draft')::uuid;end if;
 raise exception 'unsafe new work: %',scenario;
 exception when others then if sqlerrm not in('document_bytes_released','pdf_release_evidence_immutable','document_preparation_retired') then raise;end if;end;
 end loop;
 if original<>public.ar_document_exit(actor,actor,(s->>'job')::uuid,gen_random_uuid(),sess) then raise exception 'already retired job acquired new outcome';end if;
 -- Genuine persisted ACK may arrive after release, including while deletion is armed.
 r:=public.ar_retention_enroll(actor,'supabase',s->>'object',7200);item:=(r->>'id')::uuid;
 r:=public.ar_retention_claim(actor,item,claim,7200,1,60);if r->>'mode'<>'delete' then raise exception 'C pinned claim failed: %',r;end if;
 perform public.ar_retention_arm(actor,item,claim,7200);
 if not public.ar_mail_record(actor,(s->>'mail')::uuid,'awaiting_evidence','syntheticAccepted',null,null) then raise exception 'post-release proof blocked';end if;
 perform public.ar_retention_observe(actor,item,claim,'unknown',7200);
 r:=public.ar_mail_confirm_sent(actor,(s->>'mail')::uuid,'syntheticAccepted',clock_timestamp());
 if r->>'state'<>'sent' or r->>'recorded'<>'true' or (select closed_reason from public.ar_document_jobs where id=(s->>'job')::uuid) is distinct from 'sent' then raise exception 'C uncertain-delete late history/close_sent failed: %',r;end if;
 if not (public.ar_preparation_complete(actor,(s->>'mail')::uuid)->>'accepted')::boolean then raise exception 'trusted later completion failed';end if;
 update auth.sessions set not_after=now()-interval '1 second' where id=sess;
 if original<>public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess) then raise exception 'protected original changed after completion';end if;
 update auth.sessions set not_after=null where id=sess;
 perform public.ar_retention_delete_ack(actor,item,claim);delete from storage.objects where id=(s->>'object')::uuid;perform public.ar_retention_observe(actor,item,claim,'absent',7200);
 if public.ar_retention_get(actor,item,7200)->>'state'<>'deleted' then raise exception 'C exact deletion did not settle';end if;
 -- Draft creation / absent or malformed evidence is never trusted completion.
 foreach scenario in array array['draft','none','incomplete','verified'] loop
 s:=pg_temp.preparation_seed(case when scenario='draft' then 'draft' else 'send' end,'created');
 if scenario='draft' then perform public.ar_mail_record(actor,(s->>'mail')::uuid,'created','createdMessage','createdDraft',null);
 elsif scenario='incomplete' then update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,files}','[]'),provider_receipt_id='syntheticAccepted' where id=(s->>'mail')::uuid;
 elsif scenario='verified' then update ar_private.mail_deliveries set verified_sent_evidence=jsonb_build_object('gmailId','externalVerified','sentAt',clock_timestamp(),'mailbox','phuket') where id=(s->>'mail')::uuid;end if;
 r:=public.ar_preparation_complete(actor,(s->>'mail')::uuid);
 if (r->>'accepted')::boolean is distinct from (scenario='verified') then raise exception 'completion provenance failed: %, %',scenario,r;end if;
 end loop;
 s:=pg_temp.preparation_seed('send','awaiting_evidence');perform public.ar_mail_record(actor,(s->>'mail')::uuid,'awaiting_evidence','syntheticAccepted',null,null);
 select count(*) into before_count from public.ar_sent_events;r:=public.ar_preparation_complete(actor,(s->>'mail')::uuid);
 if r->>'accepted'<>'true' or (select state from ar_private.mail_deliveries where id=(s->>'mail')::uuid)<>'awaiting_evidence' or (select count(*) from public.ar_sent_events)<>before_count then raise exception 'completion rewrote business truth';end if;
 -- Incomplete Exit evidence retires admission but retains all bytes.
 s:=pg_temp.preparation_seed();update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,files}','[]') where id=(s->>'mail')::uuid;
 r:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,gen_random_uuid(),sess);
 if not ar_private.preparation_retired((s->>'job')::uuid) or ar_private.pdf_released((s->>'job')::uuid) or ar_private.preparation_projection((s->>'job')::uuid)->>'reason'<>'pdf_release_evidence_incomplete' then raise exception 'missing evidence not protected';end if;
 -- Exact preadmitted source result can settle without reopening the job.
 s:=pg_temp.preparation_seed('none');fid:=gen_random_uuid();insert into public.ar_document_files(id,job_id,ordinal,kind,state) values(fid,(s->>'job')::uuid,0,'statement','generating');update public.ar_document_jobs set state='running' where id=(s->>'job')::uuid;
 original:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,gen_random_uuid(),sess);
 if original->>'outcome'<>'pending' or ar_private.pdf_released((s->>'job')::uuid) then raise exception 'generation was not protected';end if;
 uploadkey:='jobs/'||(s->>'job')||'/originals/'||fid||'.pdf';insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',uploadkey,'{"size":100}');
 perform public.ar_document_finish_file((s->>'job')::uuid,fid,uploadkey,100,repeat('a',64));
 perform public.ar_document_finalize_abandoned(actor,25);perform public.ar_preparation_retirement_maintain(actor,25);
 if not ar_private.pdf_released((s->>'job')::uuid) then raise exception 'exact generation completion failed: %',ar_private.preparation_projection((s->>'job')::uuid);end if;
 -- An admitted upload must register its captured exact key/hash first.
 s:=pg_temp.preparation_seed();uploadkey:='jobs/'||(s->>'job')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(s->>'job')::uuid,uploadkey,100,repeat('b',64));
 original:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,gen_random_uuid(),sess);
 if ar_private.pdf_released((s->>'job')::uuid) then raise exception 'live upload released';end if;
 insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',uploadkey,'{"size":100}');perform public.ar_document_register_upload((s->>'job')::uuid,uploadkey,100,repeat('b',64),'application/pdf');perform public.ar_preparation_retirement_maintain(actor,25);
 if not ar_private.pdf_released((s->>'job')::uuid) then raise exception 'exact upload registration did not release: %',ar_private.preparation_projection((s->>'job')::uuid);end if;
 -- One combined child Exit must not retire its sibling or delete either shared-root package.
 s:=pg_temp.preparation_seed('none');s2:=pg_temp.preparation_seed('none');root_id:=gen_random_uuid();root_mail:=gen_random_uuid();
 root:=public.ar_combined_email_save(actor,root_id,0,gen_random_uuid(),jsonb_build_array(
 jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',s->>'job','documentRevision',0,'draftId',s->>'draft','draftRevision',0,'stage',null,'policyVersion',null),
 jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',s2->>'job','documentRevision',0,'draftId',s2->>'draft','draftRevision',0,'stage',null,'policyVersion',null)),
 '{"recipients":{"to":["synthetic@example.test"],"cc":[],"bcc":[]},"subject":"Combined","body":"Combined body","richBody":null,"signatureHotel":"KAT"}');
 if root?'error' then raise exception 'C combined setup failed: %',root;end if;
 select jsonb_build_object('mailbox','phuket','sender','ar@katathani.com','messageId','<'||root_mail||'@ar-workspace.ar-c82.workers.dev>','signatureHotel','KAT','recipients',root#>'{content,recipients}','subject','Combined','body','Combined body','richBody',null,
 'files',jsonb_agg(jsonb_build_object('name',f->>'name','byte_count',(f->>'byteCount')::bigint,'sha256',f->>'sha256'))) into root_expected from jsonb_array_elements(root->'members')m cross join lateral jsonb_array_elements(m->'files')f;
 r:=public.ar_combined_mail_claim(actor,root_mail,root_id,1,root_expected->>'messageId',root_expected);if r->>'claimed'<>'true' then raise exception 'C combined claim failed: %',r;end if;
 perform public.ar_document_exit(actor,actor,(s->>'job')::uuid,gen_random_uuid(),sess);
 if ar_private.pdf_released((s->>'job')::uuid) or ar_private.preparation_retired((s2->>'job')::uuid) then raise exception 'combined sibling silently retired';end if;
 perform public.ar_document_exit(actor,actor,(s2->>'job')::uuid,gen_random_uuid(),sess);perform public.ar_preparation_retirement_maintain(actor,25);
 if not ar_private.pdf_released((s->>'job')::uuid) or not ar_private.pdf_released((s2->>'job')::uuid) then raise exception 'independently exited combined siblings failed: %, %',ar_private.preparation_projection((s->>'job')::uuid),ar_private.preparation_projection((s2->>'job')::uuid);end if;
 -- Old unmarked settled command receipt cannot acquire C authority.
 s:=pg_temp.preparation_seed();cmd:=(s->>'command')::uuid;
 insert into ar_private.document_commands(owner,command_key,payload,job_id,request_actor,request_digest)
 values(actor,cmd,jsonb_build_object('hotel','KAT','account_id',s->>'scope','ids',jsonb_build_array('A'),'content','invoices','layout','combined','purpose','billing','statement_source','workspace'),(s->>'job')::uuid,actor,ar_private.document_request_digest('KAT',s->>'scope',array['A'],'invoices','combined','billing','workspace'));
 digest:=ar_private.document_request_digest('KAT',s->>'scope',array['A'],'invoices','combined','billing','workspace');
 perform public.ar_document_command_abandon(actor,actor,cmd,'KAT',digest);perform public.ar_document_abandon(actor,(s->>'job')::uuid);
 r:=public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,gen_random_uuid(),sess);
 if r->>'outcome'<>'protected' or exists(select 1 from ar_private.preparation_exit_commands where owner=actor and command_key=cmd and authorized) then raise exception 'old protected command upgraded';end if;

 -- Only the original fresh marked command tombstone transfers authority; a lost
 -- resolving HTTP response does not rerun a settled protected abandon decision.
 s:=pg_temp.preparation_seed();cmd:=(s->>'command')::uuid;marker:=gen_random_uuid();
 digest:=ar_private.document_request_digest('KAT',s->>'scope',array['A'],'invoices','combined','billing','workspace');
 insert into ar_private.document_commands(owner,command_key,payload,job_id,request_actor,request_digest) values(actor,cmd,jsonb_build_object('hotel','KAT','account_id',s->>'scope','ids',jsonb_build_array('A'),'content','invoices','layout','combined','purpose','billing','statement_source','workspace'),(s->>'job')::uuid,actor,digest);
 r:=public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,sess);if r->>'outcome'<>'resolved' or not exists(select 1 from ar_private.preparation_exit_commands where exit_command=marker and authorized) then raise exception 'fresh marked command lost original authority';end if;
 perform public.ar_document_finalize_abandoned(actor,25);perform public.ar_preparation_retirement_maintain(actor,25);
 if not ar_private.pdf_released((s->>'job')::uuid) or (select original_response->>'outcome' from ar_private.preparation_retirements where job_id=(s->>'job')::uuid)<>'protected' then raise exception 'original marked command authority did not transfer';end if;
 r:=public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,sess,current_sess);if r->>'outcome'<>'protected' or (select discard_requested_at from public.ar_document_jobs where id=(s->>'job')::uuid) is not null then raise exception 'settled marked command changed protected decision';end if;

 -- Legacy command→known and known→command receipts bind the same immutable UUID
 -- even when they explicitly do NOT authorize retirement.
 s:=pg_temp.preparation_seed();digest:=pg_temp.preparation_command(s);cmd:=(s->>'command')::uuid;marker:=gen_random_uuid();
 perform public.ar_document_command_abandon(actor,actor,cmd,'KAT',digest);perform public.ar_document_abandon(actor,(s->>'job')::uuid);
 perform public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,sess,current_sess);
 s2:=pg_temp.preparation_seed();digest2:=pg_temp.preparation_command(s2);
 begin perform public.ar_document_exit(actor,actor,(s2->>'job')::uuid,marker,sess,current_sess);raise exception 'legacy command marker reused for different known job';exception when others then if sqlerrm<>'document_exit_conflict' then raise;end if;end;
 begin perform public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,current_sess,current_sess);raise exception 'marker origin was rebound';exception when others then if sqlerrm<>'document_exit_conflict' then raise;end if;end;
 select id into other_actor from auth.users where lower(email)='unapproved@example.test';insert into auth.sessions(id,user_id,created_at) values(other_session,other_actor,clock_timestamp());
 begin perform public.ar_document_command_exit(other_actor,actor,cmd,'KAT',digest,marker,sess,other_session);raise exception 'marker actor was rebound';exception when others then if sqlerrm<>'document_exit_conflict' then raise;end if;end;
 r:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess);if r->>'outcome'<>'protected' or ar_private.preparation_retired((s->>'job')::uuid) then raise exception 'valid legacy cross-route replay acquired authority';end if;
 -- A new UUID observed first only by the no-upgrade known-job route must also
 -- conflict on an unrelated command, with no tombstone or authority for it.
 s:=pg_temp.preparation_seed();digest:=pg_temp.preparation_command(s);cmd:=(s->>'command')::uuid;perform public.ar_document_command_abandon(actor,actor,cmd,'KAT',digest);perform public.ar_document_abandon(actor,(s->>'job')::uuid);
 marker:=gen_random_uuid();original:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess);
 begin perform public.ar_document_command_exit(actor,actor,(s2->>'command')::uuid,'KAT',digest2,marker,sess,current_sess);raise exception 'known legacy marker reused for different command';exception when others then if sqlerrm<>'document_exit_conflict' then raise;end if;end;
 begin perform public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,current_sess,current_sess);raise exception 'known receipt origin was rebound';exception when others then if sqlerrm<>'document_exit_conflict' then raise;end if;end;
 r:=public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,sess,current_sess);if r->>'outcome'<>'protected' or ar_private.preparation_retired((s->>'job')::uuid) or ar_private.preparation_retired((s2->>'job')::uuid) then raise exception 'reverse replay upgraded legacy authority';end if;
 if original<>public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess) then raise exception 'legacy original response changed';end if;

 -- A known-job original receipt replayed through its matching create command is
 -- terminal too: it must not create an unsettled tombstone for a second abandon.
 s:=pg_temp.preparation_seed();digest:=pg_temp.preparation_command(s);cmd:=(s->>'command')::uuid;marker:=gen_random_uuid();
 original:=public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess);
 r:=public.ar_document_command_exit(actor,actor,cmd,'KAT',digest,marker,sess,current_sess);
 if r->>'outcome'<>'protected' or exists(select 1 from ar_private.document_command_exits where owner=actor and command_key=cmd) or (select count(*) from ar_private.preparation_retirements where exit_command=marker)<>1 then raise exception 'matching cross-route replay restarted abandon';end if;
 if original<>public.ar_document_exit(actor,actor,(s->>'job')::uuid,marker,sess,current_sess) then raise exception 'cross-route replay changed known original';end if;
end$$;
rollback;
