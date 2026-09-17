-- Synthetic permission contracts. No provider access or real invitation; rollback every row.
begin;
do $$
declare admin uuid;ph uuid:=gen_random_uuid();kl uuid:=gen_random_uuid();both_id uuid:=gen_random_uuid();unverified uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();reply jsonb;again jsonb;blocked boolean;h text;doc uuid:=gen_random_uuid();mail uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();notice uuid:=gen_random_uuid();account text:='SYNTHETIC_ACCESS';
begin
 select id into admin from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if admin is null then raise exception 'synthetic administrator missing';end if;
 if public.ar_access_self(admin)->'regions' is distinct from '["phuket","khao-lak"]'::jsonb then raise exception 'administrator scope';end if;
 if has_function_privilege('authenticated','public.ar_access_self(uuid)','execute') or has_function_privilege('anon','public.ar_access_save(uuid,uuid,text,text[],boolean,integer)','execute') or has_table_privilege('authenticated','ar_private.access_members','select') then raise exception 'membership ACL leak';end if;
 reply:=public.ar_access_save(admin,cmd,' Synthetic.Phuket@example.invalid ',array['phuket'],true,0);
 again:=public.ar_access_save(admin,cmd,'synthetic.phuket@example.invalid',array['phuket'],true,0);
 if reply is distinct from again or (reply->>'revision')::integer<>1 then raise exception 'save replay not stable';end if;
 blocked:=false;begin perform public.ar_access_save(admin,cmd,'synthetic.phuket@example.invalid',array['khao-lak'],true,0);exception when others then blocked:=sqlerrm='access_command_conflict';end;if not blocked then raise exception 'command collision accepted';end if;
 blocked:=false;begin perform public.ar_access_save(admin,gen_random_uuid(),'ar@katathani.com',array['phuket'],false,1);exception when others then blocked:=sqlerrm='access_administrator_locked';end;if not blocked then raise exception 'administrator downgrade accepted';end if;
 perform public.ar_access_save(admin,gen_random_uuid(),'synthetic.khaolak@example.invalid',array['khao-lak'],true,0);
 perform public.ar_access_save(admin,gen_random_uuid(),'synthetic.both@example.invalid',array['khao-lak','phuket'],true,0);
 perform public.ar_access_save(admin,gen_random_uuid(),'synthetic.unverified@example.invalid',array['phuket'],true,0);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(ph,'synthetic.phuket@example.invalid',now(),false),(kl,'synthetic.khaolak@example.invalid',now(),false),(both_id,'synthetic.both@example.invalid',now(),false),(unverified,'synthetic.unverified@example.invalid',null,false);
 if public.ar_access_self(unverified) is not null then raise exception 'unconfirmed member accepted';end if;
 blocked:=false;begin insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(gen_random_uuid(),'synthetic.unknown@example.invalid',now(),false);exception when others then blocked:=true;end;if not blocked then raise exception 'unapproved signup accepted';end if;
 blocked:=false;begin update auth.users set email='synthetic.changed@example.invalid' where id=ph;exception when others then blocked:=true;end;if not blocked then raise exception 'identity change accepted';end if;
 blocked:=false;begin update auth.users set email='ar@katathani.com' where id=ph;exception when others then blocked:=true;end;if not blocked then raise exception 'administrator identity adopted';end if;
 blocked:=false;begin perform public.ar_access_save(ph,gen_random_uuid(),'synthetic.escalate@example.invalid',array['phuket','khao-lak'],true,0);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'member could grant access';end if;
 foreach h in array array['KAT','TSK','TLKL','WAKL','TLFO','TSAN'] loop
  if public.ar_access_authorize(both_id,'hotel',h)->'scopeHotels' is distinct from jsonb_build_array(h) then raise exception 'both region member lost scope';end if;
  blocked:=false;begin perform public.ar_access_authorize(case when h in('KAT','TSK') then kl else ph end,'hotel',h);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'cross region admitted';end if;
 end loop;
 blocked:=false;begin perform public.ar_access_authorize(kl,'region',null,'phuket');exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'unscoped Phuket default admitted';end if;
 blocked:=false;begin perform public.ar_access_authorize(kl,'region',null,'khao-lak',null,true);exception when others then blocked:=sqlerrm='email_region_disabled';end;if not blocked then raise exception 'Khao Lak mailbox admitted';end if;
 blocked:=false;begin perform public.ar_access_authorize(ph,'future-route');exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'unknown resource kind admitted';end if;
 if public.ar_access_authorize(ph,'remittance_command',null,null,gen_random_uuid())->>'missingCommand'<>'true' then raise exception 'missing receipt cannot be safely retried';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT',account,'Synthetic Phuket','SYNTHETIC',100,0,1),('TLKL',account,'Synthetic Khao Lak','SYNTHETIC',200,0,1);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,collection_role,verification_state,compressed,synced_at) values('KAT',account,'SYNTHETIC-PH',current_date,100,100,'standalone','verified',false,now()),('TLKL',account,'SYNTHETIC-KL',current_date,200,200,'standalone','verified',false,now());
 if jsonb_array_length(public.ar_access_rows(ph,'ar_invoices',array['KAT','TSK'],account))<>1 or public.ar_access_rows(ph,'ar_invoices',array['KAT'],account)->0->>'id'<>'SYNTHETIC-PH' then raise exception 'regional row reader failed';end if;
 blocked:=false;begin perform public.ar_access_rows(ph,'ar_invoices',array['TLKL'],account);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'row scope bypass';end if;
 blocked:=false;begin perform public.ar_access_rows(ph,'access_members',array['KAT']);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'arbitrary table access';end if;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot) values(doc,admin,gen_random_uuid(),'TLKL',account,'Synthetic Khao Lak',array['SYNTHETIC-KL'],'invoices','combined','billing','synthetic','[{"id":"SYNTHETIC-KL"}]',200);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports) values(mail,admin,doc,0,'TLKL',account,'Synthetic Khao Lak',array['SYNTHETIC-KL'],'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic','Synthetic','[]');
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot) values(delivery,admin,mail,0,'draft','<'||delivery||'@example.invalid>','{}');
 foreach h in array array['document','email','delivery'] loop
  reply:=public.ar_access_authorize(kl,h,null,null,case h when 'document' then doc when 'email' then mail else delivery end);
  if reply->'scopeHotels' is distinct from '["TLKL"]'::jsonb then raise exception 'record hotel not resolved';end if;
  blocked:=false;begin perform public.ar_access_authorize(ph,h,'KAT',null,case h when 'document' then doc when 'email' then mail else delivery end);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'forged record hotel admitted';end if;
 end loop;
 if public.ar_mail_claim(admin,gen_random_uuid(),mail,0,'send',null,'<blocked@example.invalid>','{}')->>'error'<>'email_region_disabled' or public.ar_gmail_attempt_claim(admin,mail,0,'<blocked@example.invalid>')->>'error'<>'email_region_disabled' then raise exception 'database delivery guard failed';end if;
 if public.ar_mail_claim(admin,gen_random_uuid(),null,null,'test',null,'<blocked-diagnostic@example.invalid>',jsonb_build_object('supplementalSource',jsonb_build_object('draftId',mail)))->>'error'<>'email_region_disabled' then raise exception 'diagnostic bypassed region delivery';end if;
 insert into public.ar_remittances(id,owner,hotel,account_id,account_name,account_type,received_date,reference) values(notice,admin,'TLKL',account,'Synthetic','SYNTHETIC',current_date,'Synthetic');
 blocked:=false;begin perform public.ar_access_authorize(ph,'remittance_save','KAT',null,notice);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'remittance reassignment bypass';end if;
 if public.ar_access_authorize(ph,'remittance_save','KAT',null,gen_random_uuid())->'scopeHotels' is distinct from '["KAT"]'::jsonb then raise exception 'new regional remittance denied';end if;
 perform set_config('request.jwt.claim.sub',ph::text,true);if ar_private.is_member() then raise exception 'direct legacy member access broadened';end if;
 perform set_config('test.access_actor',ph::text,true);
 perform public.ar_access_authorize(ph,'hotel','KAT',null,null,false,'PUT','/api/account-settings/KAT/SYNTHETIC');
 if not exists(select 1 from ar_private.access_requests where actor=ph and workspace_owner=admin and scope_hotels=array['KAT']) then raise exception 'real actor audit lost';end if;
 perform public.ar_access_save(admin,gen_random_uuid(),'synthetic.phuket@example.invalid',array['phuket'],false,1);
 if public.ar_access_self(ph) is not null then raise exception 'suspension not immediate';end if;
 blocked:=false;begin perform public.ar_access_authorize(ph,'hotel','KAT');exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'suspended existing session admitted';end if;
 blocked:=false;begin perform public.ar_access_save(admin,gen_random_uuid(),'synthetic.phuket@example.invalid',array['khao-lak'],true,1);exception when others then blocked:=sqlerrm='access_revision_conflict';end;if not blocked then raise exception 'stale access update accepted';end if;
 perform set_config('request.jwt.claim.sub',kl::text,true);
end$$;
set local role authenticated;
do $$begin
 if exists(select 1 from public.ar_accounts) or exists(select 1 from public.ar_invoices) then raise exception 'direct table data leaked';end if;
 if exists(select 1 from storage.objects) then raise exception 'direct object data leaked';end if;
end$$;
reset role;
rollback;
