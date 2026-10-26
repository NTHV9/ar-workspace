import {spawn,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {join} from 'node:path';
/** Six real admission races against the runner's fresh, private PostgreSQL17. */
export async function verifyPreparationRetirementConcurrency({root,runDir,executable,env,database,expectedAddress,port}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||env.PGHOST!=='127.0.0.1'||String(env.PGPORT)!==String(port)||env.PGSERVICE||env.PGSERVICEFILE)throw Error('Synthetic preparation scope required');
 const args=['-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-d',database];
 const sql=q=>{const r=spawnSync(executable('psql'),[...args,'-c',q],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000});if(r.status!==0)throw Error('Preparation SQL: '+r.stderr);return r.stdout.trim();};
 if(sql("select current_database()||'|'||host(inet_server_addr())")!==database+'|'+expectedAddress)throw Error('Preparation SQL identity mismatch');
 const fixture=readFileSync(join(root,'tests/sql/preparation-byte-retirement-rollback.sql'),'utf8').replaceAll('\r\n','\n');
 const seedDefinition=fixture.slice(fixture.indexOf('create function pg_temp.preparation_seed'),fixture.indexOf('do $$')).replace('pg_temp.preparation_seed','ar_private.c_synthetic_seed');
 sql(seedDefinition+`create function ar_private.c_synthetic_rpc(q text) returns jsonb language plpgsql as $$declare r jsonb;begin execute 'select to_jsonb('||q||')' into r;return r;exception when others then return jsonb_build_object('error',sqlerrm);end$$;`);
 const owner=sql('select public.ar_financial_service_actor()'),sid=randomUUID();sql(`insert into auth.sessions(id,user_id,created_at) values('${sid}','${owner}',clock_timestamp())`);
 const sessions=[],evidence=[];const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
 function session(label){const child=spawn(executable('psql'),args,{env:{...env,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']}),s={child,label,out:'',err:'',ended:false};sessions.push(s);child.stdout.on('data',v=>s.out+=v);child.stderr.on('data',v=>s.err+=v);child.on('close',()=>s.ended=true);child.stdin.on('error',e=>s.err+=String(e));s.send=q=>child.stdin.write(q+'\n');s.wait=async mark=>{const until=Date.now()+20000;while(!s.out.includes(mark)&&!s.ended&&Date.now()<until)await new Promise(r=>setTimeout(r,20));if(!s.out.includes(mark))throw Error('Preparation session failed '+label+' '+s.err);};return s;}
 try{for(const kind of ['ordinary','draft','combined'])for(const exitFirst of [false,true]){
  const seed=JSON.parse(sql(`select ar_private.c_synthetic_seed('${kind==='draft'?'draft':'none'}','created')`)),mid=kind==='draft'?seed.mail:randomUUID(),messageId='<'+mid+'@ar-workspace.ar-c82.workers.dev>';let claim;
  let sibling=null;
  if(kind==='combined'){
   sibling=JSON.parse(sql("select ar_private.c_synthetic_seed('none','created')"));const prep=randomUUID();
   const members=[seed,sibling].map(s=>({memberId:randomUUID(),documentJobId:s.job,documentRevision:0,draftId:s.draft,draftRevision:0,stage:null,policyVersion:null}));const content={recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Combined race',body:'Combined body',richBody:null,signatureHotel:'KAT'};
   const p=JSON.parse(sql(`select public.ar_combined_email_save('${owner}','${prep}',0,'${randomUUID()}',${literal(JSON.stringify(members))}::jsonb,${literal(JSON.stringify(content))}::jsonb)`));if(p.error)throw Error('Combined race seed '+JSON.stringify(p));
   const expected={...content,mailbox:'phuket',sender:'ar@katathani.com',messageId,files:p.members.flatMap(m=>m.files.map(f=>({name:f.name,byte_count:f.byteCount,sha256:f.sha256})))};
   claim=`public.ar_combined_mail_claim('${owner}','${mid}','${prep}',1,${literal(messageId)},${literal(JSON.stringify(expected))}::jsonb)`;
  }else if(kind==='draft')claim=`public.ar_mail_claim_draft_send('${owner}','${mid}',0,(select snapshot->'expected' from ar_private.mail_deliveries where id='${mid}'),null)`;
  else{
   const expected={mailbox:'phuket',sender:'ar@katathani.com',messageId,recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Body',files:[{name:'Synthetic.pdf',byte_count:100,sha256:'a'.repeat(64)}]};
   claim=`public.ar_mail_claim('${owner}','${mid}','${seed.draft}',0,'send',null,${literal(messageId)},${literal(JSON.stringify(expected))}::jsonb)`;
  }
  const exit=`public.ar_document_exit('${owner}','${owner}','${seed.job}','${randomUUID()}','${sid}')`,label='c-prep-'+randomUUID(),first=session(label+'-first'),second=session(label+'-second');
  const safe=expr=>'ar_private.c_synthetic_rpc('+literal(expr)+')';
  first.send(`begin;set local lock_timeout='15s';select 'FIRST:'||${safe(exitFirst?exit:claim)}::text;select 'READY';`);await first.wait('READY');
  const a=JSON.parse(first.out.split('\n').find(l=>l.startsWith('FIRST:')).slice(6));if(exitFirst?!a.preparationRetirement?.accepted:!a.claimed)throw Error('First actual admission failed '+kind+' '+JSON.stringify(a));
  second.send(`begin;set local lock_timeout='15s';select 'SECOND:'||${safe(exitFirst?claim:exit)}::text;commit;select 'DONE';`);
  let waited=false;const deadline=Date.now()+10000;while(Date.now()<deadline){if(sql(`select count(*) from pg_stat_activity where application_name='${label}-second' and wait_event_type='Lock'`)==='1'){waited=true;break;}await new Promise(r=>setTimeout(r,20));}if(!waited)throw Error('Actual contender did not wait');
  first.send("commit;select 'DONE';");await Promise.all([first.wait('DONE'),second.wait('DONE')]);const b=JSON.parse(second.out.split('\n').find(l=>l.startsWith('SECOND:')).slice(7));
  if(exitFirst){if(b.claimed===true||sql(`select count(*) from ar_private.mail_deliveries where id='${mid}' and (mode='send' or draft_send_claimed_at is not null)`)!=='0')throw Error('Exit-first admitted new send '+JSON.stringify(b));}
  else{
   if(!b.preparationRetirement?.accepted)throw Error('Claim-first original Exit not accepted '+JSON.stringify(b));
   if(sibling)sql(`select public.ar_document_exit('${owner}','${owner}','${sibling.job}','${randomUUID()}','${sid}');select public.ar_preparation_retirement_maintain('${owner}',25)`);
   const result=JSON.parse(sql(`select to_jsonb(public.ar_mail_record('${owner}','${mid}','awaiting_evidence','syntheticRaceAccepted',null,null))`));if(!result)throw Error('Admitted exact completion rejected');
   if(sql(`select ar_private.pdf_released('${seed.job}')`)!=='t')throw Error('Claim-first redundant bytes not released '+kind);
  }
  if(/deadlock/i.test(first.err+second.err))throw Error('Preparation race deadlock');evidence.push({kind,exitFirst,actualLockWait:true,admissionPreserved:true,noDeadlock:true});
  for(const session of [first,second])session.child.stdin.end();await Promise.all([first,second].map(session=>new Promise(r=>{if(session.ended)return r();session.child.once('close',r);setTimeout(()=>{session.child.kill();r();},2000).unref();})));
 }
 writeFileSync(join(runDir,'preparation-retirement-concurrency.json'),JSON.stringify(evidence,null,2));
 const connectionFile=join(runDir,'c-contract-private-'+randomUUID()+'.json');writeFileSync(connectionFile,JSON.stringify({psql:executable('psql'),env,database,expectedAddress,port,nonce:randomUUID()}),{mode:0o600,flag:'wx'});
 try{const contract=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--no-file-parallelism','tests/preparation-retirement-sql-contract.test.ts'],{cwd:root,env:{...process.env,AR_SYNTHETIC_SQL_CONNECTION_FILE:connectionFile},windowsHide:true,encoding:'utf8',timeout:120000});writeFileSync(join(runDir,'preparation-retirement-sql-contract.log'),contract.stdout+'\n'+contract.stderr);if(contract.status!==0||!/3 passed/.test(contract.stdout)||/\bskipped\b/.test(contract.stdout))throw Error('C Worker/SQL contract failed: '+contract.stdout+'\n'+contract.stderr);}finally{unlinkSync(connectionFile);}return evidence;
 }finally{for(const s of sessions)if(!s.ended){s.send('rollback;');s.child.stdin.end();}await Promise.all(sessions.map(s=>new Promise(r=>{if(s.ended)return r();s.child.once('close',r);setTimeout(()=>{s.child.kill();r();},2000).unref();})));for(const s of sessions)writeFileSync(join(runDir,s.label+'.log'),s.out+'\n'+s.err);}
}
