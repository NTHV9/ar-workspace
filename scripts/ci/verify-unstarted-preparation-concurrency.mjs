import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
/** Real transactions prove claim-first stays live and Exit-first denies late work. */
export async function verifyUnstartedPreparationConcurrency({root,runDir,executable,env,database,expectedAddress,port}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||env.PGHOST!=='127.0.0.1'||String(env.PGPORT)!==String(port)||env.PGSERVICE||env.PGSERVICEFILE)throw Error('Exact synthetic unstarted scope required');
 const args=['-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-d',database],sessions=[],evidence=[];
 const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
 const sql=q=>{const r=spawnSync(executable('psql'),[...args,'-c',q],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000});if(r.status!==0)throw Error('Unstarted SQL: '+r.stderr);return r.stdout.trim();};
 if(sql("select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port()")!==database+'|'+expectedAddress+'|'+port)throw Error('Synthetic unstarted identity mismatch');
 const fixture=readFileSync(join(root,'tests/sql/tracker-preparation-never-started-exit-rollback.sql'),'utf8').replaceAll('\r\n','\n');
 const seed=fixture.slice(fixture.indexOf('create function pg_temp.unstarted_seed'),fixture.indexOf('create function pg_temp.unstarted_exit_first')).replace('create function pg_temp.unstarted_seed','create or replace function ar_private.unstarted_synthetic_seed');sql(seed);
 function session(label){const child=spawn(executable('psql'),args,{cwd:root,env:{...env,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']}),s={child,label,out:'',err:'',ended:false};sessions.push(s);child.stdout.on('data',v=>s.out+=v);child.stderr.on('data',v=>s.err+=v);child.on('close',()=>s.ended=true);child.stdin.on('error',e=>s.err+=String(e));s.send=q=>child.stdin.write(q+'\n');s.wait=async mark=>{const end=Date.now()+20000;while(!s.out.includes(mark)&&!s.ended&&Date.now()<end)await new Promise(r=>setTimeout(r,20));if(!s.out.includes(mark))throw Error('Unstarted session failed '+label+': '+s.err);};return s;}
 try{
  for(const exitFirst of [true,false]){
   const s=JSON.parse(sql("select ar_private.unstarted_synthetic_seed('TSAN',2)"));
   for(const key of ['actor','session','job'])if(!/^[0-9a-f-]{36}$/.test(s[key]))throw Error('Synthetic identity not UUID');
   const fid=sql(`select id from public.ar_document_files where job_id=${literal(s.job)} order by ordinal limit 1`),marker=randomUUID(),label='unstarted-'+randomUUID();
   const claim=`public.ar_document_claim_file(${literal(s.job)},${literal(fid)})`,exit=`public.ar_document_exit(${literal(s.actor)},${literal(s.actor)},${literal(s.job)},${literal(marker)},${literal(s.session)})`;
   const first=session(label+'-first'),second=session(label+'-second');
   first.send(`begin;set local lock_timeout='15s';select 'FIRST:'||(${exitFirst?exit:claim})::text;select 'HELD';`);await first.wait('HELD');
   second.send(`begin;set local lock_timeout='15s';select 'SECOND:'||(${exitFirst?claim:exit})::text;commit;select 'DONE';`);
   let blocked=false;const deadline=Date.now()+10000;
   while(Date.now()<deadline){if(sql(`select count(*) from pg_stat_activity where application_name=${literal(label+'-second')} and wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
   if(!blocked||second.out.includes('DONE'))throw Error('Competing unstarted operation did not wait on the actual lock');
   first.send("commit;select 'DONE';");await Promise.all([first.wait('DONE'),second.wait('DONE')]);
   if(/deadlock/i.test(first.err+second.err))throw Error('Unstarted claim/Exit lock inversion');
   const claimResult=JSON.parse((exitFirst?second:first).out.split('\n').find(l=>l.startsWith(exitFirst?'SECOND:':'FIRST:')).split(/:(.*)/s)[1]);
   if(exitFirst){
    if(claimResult.claimed!==false||claimResult.cancelled_before_claim!==true)throw Error('Exit-first admitted late generation');
    if(sql(`select closed_reason from public.ar_document_jobs where id=${literal(s.job)}`)!=='discarded'||sql(`select count(*) from ar_private.preparation_unstarted_cancellations where job_id=${literal(s.job)}`)!=='1')throw Error('Exit-first not closed/audited');
   }else{
    if(claimResult.claimed!==true||sql(`select state from public.ar_document_files where id=${literal(fid)}`)!=='generating'||sql(`select count(*) from ar_private.preparation_unstarted_cancellations where job_id=${literal(s.job)}`)!=='0'||sql(`select count(*) from public.ar_document_jobs where id=${literal(s.job)} and closed_at is null`)!=='1')throw Error('Claim-first slow generation was cancelled');
    const peer=sql(`select id from public.ar_document_files where job_id=${literal(s.job)} and id<>${literal(fid)} limit 1`);
    if(JSON.parse(sql(`select public.ar_document_claim_file(${literal(s.job)},${literal(peer)})`)).claimed!==true)throw Error('Admitted slow peer could not settle');
    for(const file of [fid,peer]){const key=`jobs/${s.job}/originals/${file}.pdf`;sql(`select public.ar_document_finish_file(${literal(s.job)},${literal(file)},${literal(key)},100,repeat('a',64));insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',${literal(key)},'{"size":100}');`);}
    sql(`select public.ar_document_finalize_abandoned(${literal(s.actor)},25);select public.ar_preparation_retirement_maintain(${literal(s.actor)},25)`);
    if(sql(`select closed_reason from public.ar_document_jobs where id=${literal(s.job)}`)!=='discarded'||sql(`select count(*) from ar_private.preparation_unstarted_cancellations where job_id=${literal(s.job)}`)!=='0')throw Error('Known slow completion did not use original discard path');
   }
   evidence.push({order:exitFirst?'exit-first':'claim-first',actualLockWait:true,claimed:claimResult.claimed,neverStartedReceipt:exitFirst,startedWorkPreserved:!exitFirst,noDeadlock:true});
   first.child.stdin.end();second.child.stdin.end();
   await Promise.all([first,second].map(s=>new Promise(r=>{if(s.ended)return r();s.child.once('close',r);setTimeout(()=>{s.child.kill();r();},2000).unref();})));
  }
  writeFileSync(join(runDir,'unstarted-preparation-concurrency.json'),JSON.stringify(evidence,null,2));return evidence;
 }finally{
  for(const s of sessions)if(!s.ended){s.send('rollback;');s.child.stdin.end();}
  await Promise.all(sessions.map(s=>new Promise(r=>{if(s.ended)return r();s.child.once('close',r);setTimeout(()=>{s.child.kill();r();},2000).unref();})));
  for(const s of sessions)writeFileSync(join(runDir,s.label+'.log'),s.out+'\n'+s.err);
  sql('drop function if exists ar_private.unstarted_synthetic_seed(text,integer,text)');
 }
}
