import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

/** Runs against the caller's fresh synthetic database; never provisions or accepts
 * a remote database. Two real psql sessions invoke the installed production RPCs. */
export async function verifyDraftDiscardConcurrency({root,runDir,executable,env,database,expectedAddress,port,expectDeadlock=false,legacyJob}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||!['127.0.0.1','localhost','::1'].includes(env.PGHOST)||String(env.PGPORT)!==String(port)||!expectedAddress)throw Error('Synthetic concurrency scope required');
 const base=['-X','--no-password','-d',database,'-v','ON_ERROR_STOP=1','-q','-t','-A'];
 const sync=sql=>{
  const r=spawnSync(executable('psql'),[...base,'-c',sql],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:15000});
  if(r.status!==0||r.error)throw Error('Synthetic concurrency control query failed: '+(r.stderr??''));
  return r.stdout.trim();
 };
 // The requested loopback port is checked above; a Docker port map legitimately
 // has a different server-side port. Attest the exact database/server address.
 if(sync("select current_database()||'|'||host(inet_server_addr())")!==database+'|'+expectedAddress)throw Error('Synthetic concurrency identity mismatch');
 const marker='draft-discard-'+randomUUID(),scope='SYNTHETIC-LOCK-'+randomUUID(),job=randomUUID();
 const actor=sync("select id from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null");
 if(!/^[a-f0-9-]{36}$/.test(actor))throw Error('Synthetic actor missing');
 sync(`begin;select set_config('ar.document_lifecycle','transient',true);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT','${scope}','Synthetic lock account','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT','${scope}','A',current_date,100,100,'verified','standalone',false,now());
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values('${job}','${actor}',gen_random_uuid(),'KAT','${scope}','Synthetic lock preparation',array['A'],'invoices','combined','billing','${job}','[{"id":"A","open":100}]',100,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"jobs/${job}/exports/${randomUUID()}.pdf","byte_count":100,"sha256":"${'a'.repeat(64)}"}]',true);commit;`);
 const draft=JSON.parse(sync(`select jsonb_build_object('id',d->>'id','revision',d->>'revision') from(select public.ar_email_open('${actor}','${job}',1)d)x`));
 if(!/^[a-f0-9-]{36}$/.test(draft.id)||!/^\d+$/.test(draft.revision))throw Error('Synthetic draft creation failed');
 const sessions=[];
 function session(name){
  const child=spawn(executable('psql'),base,{cwd:root,env:{...env,PGAPPNAME:marker+'-'+name},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const s={child,stdout:'',stderr:'',ended:false};sessions.push(s);
  const waiters=[];const wake=()=>{for(const resolve of waiters.splice(0))resolve();};
  child.stdout.on('data',v=>{s.stdout+=v.toString();wake();});child.stderr.on('data',v=>{s.stderr+=v.toString();wake();});child.on('close',()=>{s.ended=true;wake();});
  s.send=sql=>child.stdin.write(sql+'\n');
  s.wait=async label=>{
   const deadline=Date.now()+15000;
   while(!s.stdout.includes(label)&&!s.ended){
    if(Date.now()>deadline)throw Error('Synthetic concurrency session deadline: '+name);
    await Promise.race([new Promise(resolve=>waiters.push(resolve)),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Synthetic concurrency session stalled: '+name)),15000);timer.unref();})]);
   }
   if(!s.stdout.includes(label))throw Error('Synthetic concurrency session failed: '+name+' '+s.stderr);
  };
  return s;
 }
 const evidence={synthetic:true,scenario:'actual save_v3 concurrent with abandon/discard',expectDeadlock};
 try{
  const a=session('discard'),b=session('save');
  a.send(`\\set VERBOSITY verbose
 begin;set local deadlock_timeout='50ms';select pg_advisory_xact_lock(61704,1439);select id from public.ar_document_jobs where id='${job}' for update;select 'A_READY';`);
  await a.wait('A_READY');
  b.send(`\\set VERBOSITY verbose
 begin;set local deadlock_timeout='5s';select 'B_RESULT:'||coalesce(public.ar_email_save_v3('${actor}','${draft.id}',${draft.revision},'billing','{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]}','Synthetic edit','Synthetic content',null,null,null)->>'error','saved');commit;select 'B_DONE';`);
  // Coordinate on PostgreSQL's observed lock wait, not a guessed delay.
  const deadline=Date.now()+10000;let waitEvent;
  while(Date.now()<deadline){
   waitEvent=sync(`select coalesce(wait_event,'') from pg_stat_activity where application_name='${marker}-save' and state='active' and wait_event_type='Lock'`);
   if(waitEvent)break;
   if(b.ended)throw Error('Save exited before the intended lock wait');
  }
  if(!waitEvent)throw Error('Save never entered a database lock wait');
  evidence.saveWaitBeforeDiscard=waitEvent;
  a.send(`select 'A_RESULT:'||(public.ar_document_abandon('${actor}','${job}')->>'outcome');commit;select 'A_DONE';`);
  await Promise.allSettled([a.wait('A_DONE'),b.wait('B_DONE')]);
  evidence.deadlock=/40P01/.test(a.stderr+b.stderr);
  if(expectDeadlock){if(!evidence.deadlock)throw Error('Expected old lock-order deadlock was not reproduced');}
  else{
   if(evidence.deadlock||!a.stdout.includes('A_RESULT:discarded')||!b.stdout.match(/B_RESULT:document_(closed|discard_pending)/))throw Error('Discard/save did not serialize safely: '+a.stderr+b.stderr);
   const c=session('held-draft');
   c.send(`begin;select id from public.ar_email_drafts where id='${draft.id}' for update;select 'C_READY';`);await c.wait('C_READY');
   sync(`begin;set local lock_timeout='1s';select public.ar_document_cleanup_job_candidates('${actor}','${job}',1);commit;`);
   if(sync(`select (j.discard_text_pending and d.subject<>'')::text from public.ar_document_jobs j join public.ar_email_drafts d on d.document_job_id=j.id where j.id='${job}'`)!=='true')throw Error('Locked draft was not preserved for cleanup retry');
   c.send("commit;select 'C_DONE';");await c.wait('C_DONE');
   sync(`select public.ar_document_cleanup_job_candidates('${actor}','${job}',1)`);
   const state=JSON.parse(sync(`select jsonb_build_object('closed',j.closed_reason='discarded','pending',j.discard_text_pending,'scrubbed',d.subject='' and d.body='' and d.rich_body is null and d.template_ref is null and d.recipients='{"to":[],"cc":[],"bcc":[]}'::jsonb) from public.ar_document_jobs j join public.ar_email_drafts d on d.document_job_id=j.id where j.id='${job}'`));
   if(!state.closed||!state.scrubbed||state.pending)throw Error('Concurrent save restored discarded text or cleanup did not settle');
   evidence.lockedDraftSkipped=true;evidence.cleanupRetrySettled=true;
   if(legacyJob){
    if(!/^[a-f0-9-]{36}$/.test(legacyJob))throw Error('Invalid synthetic legacy job');
    sync(`select public.ar_document_cleanup_job_candidates('${actor}','${legacyJob}',1);select public.ar_document_cleanup_candidates('${actor}',25)`);
    if(sync(`select (not j.discard_text_pending and d.subject='Synthetic pre-migration subject' and d.body='Synthetic pre-migration body')::text from public.ar_document_jobs j join public.ar_email_drafts d on d.document_job_id=j.id where j.id='${legacyJob}'`)!=='true')throw Error('Pre-migration text was retrospectively scrubbed');
    evidence.legacyTextPreserved=true;
   }
   evidence.discarded=true;evidence.textScrubbed=true;evidence.saveRejectedAs=b.stdout.match(/B_RESULT:([a-z_]+)/)?.[1];
  }
  writeFileSync(join(runDir,'draft-discard-concurrency-'+(expectDeadlock?'red':'green')+'.json'),JSON.stringify(evidence,null,2));
  return evidence;
 }finally{
  for(const s of sessions){if(!s.ended){s.send('rollback;\n\\q');s.child.stdin.end();}}
  await Promise.all(sessions.map(s=>s.ended?Promise.resolve():new Promise(resolve=>{s.child.once('close',resolve);const timer=setTimeout(()=>{s.child.kill();resolve();},2000);timer.unref();})));
 }
}
