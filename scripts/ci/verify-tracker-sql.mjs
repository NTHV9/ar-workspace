import {verifyUnstartedPreparationConcurrency} from './verify-unstarted-preparation-concurrency.mjs';
import {verifyPreparationRetirementConcurrency} from './verify-preparation-retirement-concurrency.mjs';
import {verifyCommandExitConcurrency} from './verify-command-exit-concurrency.mjs';
import {verifyPdfReleaseConcurrency} from './verify-pdf-release-concurrency.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {verifyDraftDiscardConcurrency} from './verify-draft-discard-concurrency.mjs';
import {verifyCombinedEmailContract} from './verify-combined-email-contract.mjs';
import {mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';

// Synthetic PostgreSQL only. Never accepts a connection URL or an existing DB.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const host=process.env.PGHOST??'127.0.0.1',port=process.env.PGPORT??'55439';
if(!['127.0.0.1','localhost','::1'].includes(host)||!/^\d{4,5}$/.test(port)||Number(port)>65535)throw Error('Synthetic SQL requires a loopback host and explicit local port');
const initialize=process.env.AR_CI_INITDB==='true';
// CI's loopback Docker port map may terminate at the exact container address
// attested by the workflow's docker inspect. Never allow a whole subnet.
const expectedAddress=initialize?'127.0.0.1':process.env.AR_CI_EXPECT_SERVER_ADDR;
if(typeof expectedAddress!=='string'||isIP(expectedAddress)!==4)throw Error('Exact attested synthetic IPv4 server address required');
const bootstrap=process.env.PGDATABASE??'postgres';
if(bootstrap!=='postgres'&&!/^ar_ci_[a-z0-9_]+$/.test(bootstrap))throw Error('Synthetic bootstrap database name required');
const database='ar_ci_tracker_'+randomUUID().replaceAll('-','');
const user=initialize?'ar_ci_admin':process.env.PGUSER??'postgres';
if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(user))throw Error('Invalid local PostgreSQL role');
if(!initialize&&(process.env.AR_CI_SERVICE!=='true'||bootstrap!=='ar_ci_bootstrap'||user!=='ar_ci_admin'||process.env.PGDATABASE!==bootstrap))throw Error('Service mode requires explicit fresh ar_ci_bootstrap / ar_ci_admin and AR_CI_SERVICE=true');
const password=initialize?randomBytes(32).toString('hex'):process.env.PGPASSWORD;
const runDir=resolve(root,'.tmp/coverage-sheet-sql',randomUUID());mkdirSync(runDir,{recursive:true});
const cluster=join(runDir,'cluster'),bin=process.env.PG_BIN;
const cleanEnv={};for(const key of ['SystemRoot','SystemDrive','WINDIR','TEMP','TMP','PATH','Path','LANG'])if(process.env[key])cleanEnv[key]=process.env[key];
Object.assign(cleanEnv,{PGHOST:host,PGPORT:port,PGUSER:user,PGCONNECT_TIMEOUT:'10',PGAPPNAME:'ar-ci-tracker-synthetic'});
if(password)cleanEnv.PGPASSWORD=password;
let sequence=0,started=false,created=false;
const report={database,host,port,expectedAddress,synthetic:true,migrations:[],fixtures:[],failures:[],passed:false};
writeFileSync(join(runDir,'synthetic-marker.json'),JSON.stringify(report,null,2));
function executable(name){return bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name;}
function tool(name,args,{quiet=false}={}){
 const result=spawnSync(executable(name),args,{cwd:root,env:cleanEnv,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,stdio:quiet?'ignore':'pipe'});
 const log=join(runDir,String(++sequence).padStart(3,'0')+'-'+name+'.log');
 writeFileSync(log,(result.stdout??'')+'\n'+(result.stderr??''));
 if(result.status!==0||result.error)throw Error(`Synthetic ${name} failed; inspect ${log}`);
 return result.stdout??'';
}
// psql input files retain LF function bodies required by definition drift gates.
function file(path,rollbackEnvelope=false){const copy=join(runDir,'sql-'+String(sequence+1)+'.sql');const source=readFileSync(path,'utf8').replaceAll('\r\n','\n').replaceAll('\r','\n');writeFileSync(copy,rollbackEnvelope?'begin;\n'+source+'\nrollback;\n':source);return tool('psql',['-X','--no-password','-d',database,'-v','ON_ERROR_STOP=1','-q','-f',copy]);}
function command(text,db=database){return tool('psql',['-X','--no-password','-d',db,'-v','ON_ERROR_STOP=1','-q','-t','-A','-c',text]).trim();}
try{
 if(initialize){
  if(!bin||!existsSync(executable('initdb')))throw Error('PG_BIN must point to approved PostgreSQL binaries');
  const probe=spawnSync(executable('pg_isready'),['-h',host,'-p',port],{env:cleanEnv,windowsHide:true,timeout:10000,stdio:'ignore'});
  if(probe.status===0||probe.status===1)throw Error('Local port is already occupied; no server touched');
  const pw=join(runDir,'local-password.private');writeFileSync(pw,password,{mode:0o600});
  tool('initdb',['-D',cluster,'-U',user,'--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+pw]);
  started=true;
  tool('pg_ctl',['-D',cluster,'-l',join(runDir,'postgres.log'),'-w','-t','60','-o',`-h 127.0.0.1 -p ${port} -c max_connections=12 -c max_locks_per_transaction=256 -c shared_buffers=32MB -c log_statement=none -c log_min_error_statement=panic`,'start'],{quiet:true});
 }
 const bootstrapIdentity=command("select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port()",bootstrap);
 if(bootstrapIdentity!==bootstrap+'|'+expectedAddress+'|'+port)throw Error('Synthetic bootstrap server identity mismatch');
 const version=Number(command('show server_version_num',bootstrap));if(version<170000||version>=180000)throw Error('PostgreSQL 17 required');
 if(command('select current_user',bootstrap)!==user)throw Error('Synthetic administrator identity mismatch');
 if(!initialize){
  if(command("select count(*) from pg_database where datname not in('template0','template1','postgres','ar_ci_bootstrap')",bootstrap)!=='0')throw Error('Service cluster is not fresh');
  if(command("select count(*) from pg_roles where rolname!~'^pg_' and rolname<>'ar_ci_admin'",bootstrap)!=='0')throw Error('Service cluster already has custom roles');
  if(command("select count(*) from information_schema.tables where table_schema not in('pg_catalog','information_schema')",bootstrap)!=='0')throw Error('Service bootstrap is not empty');
 }
 if(!/^ar_ci_[a-z0-9_]+$/.test(database))throw Error('Synthetic database prefix guard failed');
 if(command(`select count(*) from pg_database where datname='${database}'`,bootstrap)!=='0')throw Error('Refusing an existing database');
 tool('createdb',['--no-password',database]);created=true;
 const identity=command("select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port()");
 if(identity!==database+'|'+expectedAddress+'|'+port)throw Error('Synthetic database identity mismatch');
 if(command("select count(*) from information_schema.tables where table_schema not in('pg_catalog','information_schema')")!=='0')throw Error('Synthetic database is not empty');
 file(join(root,'scripts/recovery/supabase-stubs.sql'));
 const migrationDir=join(root,'supabase/migrations');
 for(const name of readdirSync(migrationDir).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()){
  if(name.endsWith('_ar_tracker_resolve_authority_alias.sql')){
   let reproduced=false;
   try{file(join(root,'tests/sql/tracker-resolve-authority-alias-rollback.sql'));}
   catch{const log=readFileSync(join(runDir,String(sequence).padStart(3,'0')+'-psql.log'),'utf8');reproduced=/record "c" has no field "hotel"/.test(log);}
   if(!reproduced)throw Error('Resolver alias regression did not reproduce before migration');
   report.aliasBaseline='record c has no field hotel reproduced before alias migration';
   console.log('PASS resolver alias baseline reproduced');
  }
  if(name.endsWith('_ar_provider_quota_warn_only.sql')){
   let reproduced=false;
   try{file(join(root,'tests/sql/provider-quota-warnings-rollback.sql'));}
   catch{const log=readFileSync(join(runDir,String(sequence).padStart(3,'0')+'-psql.log'),'utf8');reproduced=/warn-only baseline quota rejection:.*budget_usage_unverified/.test(log);}
   if(!reproduced)throw Error('Quota suspension regression did not reproduce before warn-only migration');
   report.quotaBaseline='budget_usage_unverified reproduced on null quota telemetry before warn-only migration';
   console.log('PASS quota suspension baseline reproduced');
  }
  if(name.endsWith('_ar_retired_file_recreate_scope.sql')){
   let reproduced=false;
   try{file(join(root,'tests/sql/tracker-preparation-recreate-retention-rollback.sql'));}
   catch{const log=readFileSync(join(runDir,String(sequence).padStart(3,'0')+'-psql.log'),'utf8');reproduced=/fresh preparation blocked by exited-file cleanup: retention_busy/.test(log);}
   if(!reproduced)throw Error('Exited-file cleanup / fresh preparation regression did not reproduce before migration');
   report.recreateRetentionBaseline='fresh preparation rejected with retention_busy while an exited file was armed';
   console.log('PASS exited-file cleanup recreate baseline reproduced');
  }
  if(name.endsWith('_ar_preparation_cancel_before_claim.sql')){
   let reproduced=false;
   try{file(join(root,'tests/sql/tracker-preparation-never-started-exit-rollback.sql'));}
   catch{const log=readFileSync(join(runDir,String(sequence).padStart(3,'0')+'-psql.log'),'utf8');reproduced=/unstarted preparation was not discarded after accepted Exit/.test(log);}
   if(!reproduced)throw Error('Unstarted Exit/late-claim regression did not reproduce before migration');
   report.unstartedExitBaseline='accepted Exit leaves unclaimed pending files queued before cancellation barrier';
   console.log('PASS unstarted Exit cancellation baseline reproduced');
  }
  file(join(migrationDir,name));report.migrations.push(name);
 }
 file(join(root,'scripts/recovery/local-fixture-prerequisites.sql'));
 const tests=join(root,'tests/sql');
 for(const name of readdirSync(tests).filter(n=>/^tracker-.*-rollback\.sql$/.test(n)||['aging-current-root-count-rollback.sql','aging-invoice-status-rollback.sql','aging-source-membership-rollback.sql','preparation-byte-retirement-rollback.sql','pdf-byte-release-rollback.sql','document-command-exit-rollback.sql','invoice-exceptions-rollback.sql','document-abandon-rollback.sql','transient-documents-rollback.sql','mail-verified-sent-rollback.sql','refresh-retained-zero-scope-rollback.sql','retained-zero-rollback.sql','account-workspace-rollback.sql','provider-quota-warnings-rollback.sql','provider-usage-rollback.sql'].includes(n)).sort()){
  const text=readFileSync(join(tests,name),'utf8'),ownTransaction=/^begin;/im.test(text)&&/rollback;\s*$/i.test(text);
  try{file(join(tests,name),!ownTransaction);report.fixtures.push(name);console.log('PASS '+name);}
  catch(error){report.failures.push({name,error:String(error)});console.log('FAIL '+name);}
 }
 for(const name of ['operations-budget-rollback.sql','storage-budget-rollback.sql']){
  try{file(join(root,'scripts/recovery',name));report.fixtures.push(name);console.log('PASS '+name);}
  catch(error){report.failures.push({name,error:String(error)});console.log('FAIL '+name);}
 }
 if(report.failures.length)throw Error(`${report.failures.length} synthetic tracker SQL fixtures failed; inspect report`);
 // Two real database sessions contend on the same expected settings revision.
 const providerActor=command("select id from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null");
 if(!/^[0-9a-f-]{36}$/.test(providerActor))throw Error('Synthetic provider actor missing');
 const providerCommands=[randomUUID(),randomUUID()];
 const providerRace=await Promise.all(providerCommands.map((id,index)=>new Promise((resolve,reject)=>{
  const sql=`begin; set local request.jwt.claims='{"role":"service_role"}'; set local request.headers='{"x-ar-actor":"${providerActor}"}'; select public.ar_provider_alert_save('${providerActor}','cloudflare',${81+index},0,'${id}'); commit;`;
  const child=spawn(executable('psql'),['-X','--no-password','-d',database,'-v','ON_ERROR_STOP=1','-q','-t','-A','-c',sql],{cwd:root,env:cleanEnv,windowsHide:true});let output='',errors='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Provider settings race timeout'));},20000);
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);writeFileSync(join(runDir,`provider-settings-race-${index}.log`),output+'\n'+errors);if(code!==0)return reject(Error('Provider settings race failed'));try{resolve(JSON.parse(output.trim()));}catch(error){reject(error);}});
 })));
 if(providerRace.filter(result=>result.revision===1).length!==1||providerRace.filter(result=>result.error==='provider_revision_conflict'&&result.latest?.revision===1).length!==1)throw Error('Provider settings concurrency did not preserve one winner');
 if(command('select revision from ar_private.provider_alert_settings where provider=\'cloudflare\'')!=='1'||command('select count(*) from ar_private.provider_alert_commands')!=='2')throw Error('Provider race lost revision or receipts');
 report.providerSettingsConcurrency='two sessions: one revision-1 winner, one immutable revision-conflict receipt';
 console.log('PASS concurrent provider alert settings revision and receipts');
 report.commandExitConcurrency=await verifyCommandExitConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS real SQL command close/create both concurrent orders, lost response and exact replay');
 report.documentExitConcurrency=await verifyDraftDiscardConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS concurrent message Save / preparation Exit and deferred cleanup retry');
 report.combinedEmailContract=await verifyCombinedEmailContract({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS real Worker HTTP / PostgreSQL combined email contract (3 scenarios, one provider POST each)');
 report.pdfReleaseConcurrency=await verifyPdfReleaseConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS real SQL provider-claim-first / byte-release-first admission ordering');
 report.preparationRetirementConcurrency=await verifyPreparationRetirementConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS real SQL ordinary/draft/combined claim-first and Exit-first retirement admission');
 report.unstartedPreparationConcurrency=await verifyUnstartedPreparationConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS real SQL unstarted Exit-first cancellation and claim-first slow-generation preservation');
 report.passed=true;console.log(`PASS ${report.migrations.length} migrations; ${report.fixtures.length} tracker SQL rollback fixtures`);
}finally{
 if(created){try{tool('dropdb',['--no-password',database]);}catch{report.cleanupError='Synthetic database drop failed';}}
 if(started){try{tool('pg_ctl',['-D',cluster,'-m','fast','-w','-t','60','stop'],{quiet:true});}catch{report.cleanupError='Owned synthetic server stop failed';}}
 writeFileSync(join(runDir,'report.json'),JSON.stringify(report,null,2));console.log('Synthetic SQL report: '+join(runDir,'report.json'));
 if(report.cleanupError)throw Error(report.cleanupError);
}
