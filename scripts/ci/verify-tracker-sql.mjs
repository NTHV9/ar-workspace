import {spawnSync} from 'node:child_process';
import {verifyDraftDiscardConcurrency} from './verify-draft-discard-concurrency.mjs';
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
  file(join(migrationDir,name));report.migrations.push(name);
 }
 file(join(root,'scripts/recovery/local-fixture-prerequisites.sql'));
 const tests=join(root,'tests/sql');
 for(const name of readdirSync(tests).filter(n=>/^tracker-.*-rollback\.sql$/.test(n)||['invoice-exceptions-rollback.sql','document-abandon-rollback.sql','transient-documents-rollback.sql','mail-verified-sent-rollback.sql','refresh-retained-zero-scope-rollback.sql','retained-zero-rollback.sql','account-workspace-rollback.sql'].includes(n)).sort()){
  const text=readFileSync(join(tests,name),'utf8'),ownTransaction=/^begin;/im.test(text)&&/rollback;\s*$/i.test(text);
  try{file(join(tests,name),!ownTransaction);report.fixtures.push(name);console.log('PASS '+name);}
  catch(error){report.failures.push({name,error:String(error)});console.log('FAIL '+name);}
 }
 if(report.failures.length)throw Error(`${report.failures.length} synthetic tracker SQL fixtures failed; inspect report`);
 report.documentExitConcurrency=await verifyDraftDiscardConcurrency({root,runDir,executable,env:cleanEnv,database,expectedAddress,port});
 console.log('PASS concurrent message Save / preparation Exit and deferred cleanup retry');
 report.passed=true;console.log(`PASS ${report.migrations.length} migrations; ${report.fixtures.length} tracker SQL rollback fixtures`);
}finally{
 if(created){try{tool('dropdb',['--no-password',database]);}catch{report.cleanupError='Synthetic database drop failed';}}
 if(started){try{tool('pg_ctl',['-D',cluster,'-m','fast','-w','-t','60','stop'],{quiet:true});}catch{report.cleanupError='Owned synthetic server stop failed';}}
 writeFileSync(join(runDir,'report.json'),JSON.stringify(report,null,2));console.log('Synthetic SQL report: '+join(runDir,'report.json'));
 if(report.cleanupError)throw Error(report.cleanupError);
}
