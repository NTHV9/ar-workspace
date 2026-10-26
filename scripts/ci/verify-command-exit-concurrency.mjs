import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyCommandExitConcurrency({root,runDir,executable,env,database,expectedAddress,port}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||env.PGHOST!=='127.0.0.1'||String(env.PGPORT)!==String(port))throw Error('Exact local synthetic scope required');
 const args=['-X','--no-password','-d',database,'-v','ON_ERROR_STOP=1','-q','-t','-A'];
 const sync=sql=>{const r=spawnSync(executable('psql'),[...args,'-c',sql],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
 if(sync("select current_database()||'|'||host(inet_server_addr())")!==database+'|'+expectedAddress)throw Error('Server scope mismatch');
 const actor=sync("select id from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null");
 const sessions=[];const evidence=[];
 function session(label){const child=spawn(executable('psql'),args,{cwd:root,env:{...env,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']});const s={child,out:'',err:'',ended:false};sessions.push(s);child.stdout.on('data',v=>s.out+=v);child.stderr.on('data',v=>s.err+=v);child.on('close',()=>s.ended=true);s.send=sql=>child.stdin.write(sql+'\n');s.wait=async marker=>{const deadline=Date.now()+15000;while(!s.out.includes(marker)&&!s.ended&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));if(!s.out.includes(marker))throw Error('SQL session failed '+label+' '+s.err);};return s;}
 try{for(const closeFirst of [true,false]){
  const account='SYNTHETIC-EXIT-'+randomUUID(),command=randomUUID(),label='command-exit-'+randomUUID();
  sync(`insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT','${account}','Synthetic command exit','SYNTHETIC',100,0,1,'verified');insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT','${account}','A',current_date,100,100,'verified','standalone',false,now());`);
  const fields=['ar-document-create-v1','KAT',account,'1','A','statement','combined','billing','workspace'];const digest=createHash('sha256').update(fields.map(v=>Buffer.byteLength(v)+':'+v).join('')).digest('hex');
  const create=`public.ar_document_create_v5('${actor}','${command}','KAT','${account}',array['A'],'statement','combined','billing','workspace')`,close=`public.ar_document_command_abandon('${actor}','${actor}','${command}','KAT','${digest}')`;
  const a=session(label+'-first'),b=session(label+'-second');
  a.send(`begin;set local lock_timeout='10s';select pg_advisory_xact_lock(hashtextextended('${actor}:${command}',61705));select 'READY';`);await a.wait('READY');
  b.send(`begin;set local lock_timeout='10s';select 'SECOND:'||${closeFirst?create:close}::text;commit;select 'DONE';`);
  const deadline=Date.now()+10000;let waiting=false;while(Date.now()<deadline){if(sync(`select count(*) from pg_stat_activity where application_name='${label}-second' and wait_event_type='Lock'`)==='1'){waiting=true;break;}}
  if(!waiting)throw Error('Second command never contended');
  a.send(`select 'FIRST:'||${closeFirst?close:create}::text;commit;select 'DONE';`);await Promise.all([a.wait('DONE'),b.wait('DONE')]);
  if(/deadlock/i.test(a.err+b.err))throw Error('Command lock inversion');
  const value=JSON.parse(b.out.split('\n').find(v=>v.startsWith('SECOND:')).slice(7));
  if(closeFirst){if(value.error!=='document_command_cancelled'||sync(`select count(*) from ar_private.document_commands where owner='${actor}' and command_key='${command}'`)!=='0')throw Error('Close-first admitted a job');}
  else{
   if(!value.job_id||value.outcome!=='resolved')throw Error('Lost response did not resolve exact job');
   // Simulate lost second RPC: existing maintenance must consume exact tombstone.
   sync(`select public.ar_document_finalize_abandoned('${actor}',25)`);
   if(sync(`select (discard_requested_at is not null)::text from public.ar_document_jobs where id='${value.job_id}'`)!=='true')throw Error('Create-first lost durable cleanup request');
  }
  const duplicate=JSON.parse(sync(`select ${close}`));if(duplicate.payloadDigest!==digest)throw Error('Duplicate changed scope');
  let rejected=false;try{sync(`select public.ar_document_command_abandon('${actor}','${actor}','${command}','KAT','${'f'.repeat(64)}')`);}catch(e){rejected=/document_command_conflict/.test(String(e));}if(!rejected)throw Error('Altered digest hijacked close');
  rejected=false;try{sync(`select public.ar_document_command_abandon('${randomUUID()}','${actor}','${command}','KAT','${digest}')`);}catch(e){rejected=/access_forbidden|document_forbidden/.test(String(e));}if(!rejected)throw Error('Changed actor hijacked close');
  evidence.push({closeFirst,actualLockWait:true,noDeadlock:true,duplicate:true,digestRejected:true,actorRejected:true,...closeFirst?{admitted:false}:{durableCleanup:true,lostResponse:true}});
 }
 writeFileSync(join(runDir,'document-command-exit-concurrency.json'),JSON.stringify(evidence,null,2));return evidence;
 }finally{for(const s of sessions)if(!s.ended){s.send('rollback;\n\\q');s.child.stdin.end();}await Promise.all(sessions.map(s=>s.ended?Promise.resolve():new Promise(r=>{s.child.once('close',r);const timer=setTimeout(()=>{s.child.kill();r();},2000);timer.unref();})));}
}
