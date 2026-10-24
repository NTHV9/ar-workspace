import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),bin=process.env.PG_BIN;
if(!bin)throw Error('PG_BIN required for a separate owned local guard-test cluster');
const dir=resolve(root,'.tmp/coverage-sheet-sql-guards',randomUUID());mkdirSync(dir,{recursive:true});
const cluster=join(dir,'cluster'),password=randomBytes(32).toString('hex'),passwordFile=join(dir,'password.private');writeFileSync(passwordFile,password,{mode:0o600});
const env={};for(const key of ['SystemRoot','SystemDrive','WINDIR','TEMP','TMP','PATH','Path','LANG'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:'55440',PGUSER:'ar_ci_admin',PGPASSWORD:password,PGCONNECT_TIMEOUT:'10'});
const exe=name=>join(bin,name+(process.platform==='win32'?'.exe':''));let started=false,sequence=0;
const results=[];
function tool(name,args,quiet=false){const r=spawnSync(exe(name),args,{env,cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,stdio:quiet?'ignore':'pipe'});writeFileSync(join(dir,String(++sequence)+'-'+name+'.log'),(r.stdout??'')+'\n'+(r.stderr??''));if(r.status!==0||r.error)throw Error('Owned guard-test tool failed: '+name);return (r.stdout??'').trim();}
function sql(text,db='ar_ci_bootstrap'){return tool('psql',['-X','--no-password','-d',db,'-v','ON_ERROR_STOP=1','-q','-t','-A','-c',text]);}
function catalog(){return sql("select jsonb_build_object('databases',(select jsonb_agg(datname order by datname) from pg_database),'roles',(select jsonb_agg(rolname order by rolname) from pg_roles),'relations',(select jsonb_agg(table_schema||'.'||table_name order by table_schema,table_name) from information_schema.tables where table_schema not in('pg_catalog','information_schema')))::text");}
function rejected(name,overrides,expected){const before=catalog();const r=spawnSync(process.execPath,[join(root,'scripts/ci/verify-tracker-sql.mjs')],{env:{...env,PG_BIN:bin,PGDATABASE:'ar_ci_bootstrap',AR_CI_SERVICE:'true',AR_CI_EXPECT_SERVER_ADDR:'127.0.0.1',...overrides},cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});const output=(r.stdout??'')+'\n'+(r.stderr??'');writeFileSync(join(dir,name+'.log'),output);if(r.status===0||!output.includes(expected)||catalog()!==before)throw Error('Runner safety guard failed: '+name);results.push(name);console.log('PASS '+name);}
try{
 const probe=spawnSync(exe('pg_isready'),['-h','127.0.0.1','-p','55440'],{env,windowsHide:true,timeout:10000,stdio:'ignore'});if(probe.status===0||probe.status===1)throw Error('Guard-test loopback port occupied');
 tool('initdb',['-D',cluster,'-U','ar_ci_admin','--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+passwordFile]);
 started=true;tool('pg_ctl',['-D',cluster,'-l',join(dir,'postgres.log'),'-w','-t','60','-o','-h 127.0.0.1 -p 55440 -c shared_buffers=16MB -c log_statement=none -c log_min_error_statement=panic','start'],true);
 if(sql("select current_user||'|'||host(inet_server_addr())||'|'||inet_server_port()",'postgres')!=='ar_ci_admin|127.0.0.1|55440')throw Error('Owned guard-test server identity mismatch');
 tool('createdb',['--no-password','ar_ci_bootstrap']);
 rejected('wrong-default-database',{PGDATABASE:'postgres'},'Service mode requires explicit');
 rejected('wrong-admin-role',{PGUSER:'postgres'},'Service mode requires explicit');
 rejected('remote-host',{PGHOST:'db.example.invalid'},'loopback host');
 rejected('service-not-authorized',{AR_CI_SERVICE:'false'},'Service mode requires explicit');
 rejected('missing-server-attestation',{AR_CI_EXPECT_SERVER_ADDR:''},'Exact attested synthetic IPv4');
 rejected('unattested-server-address',{AR_CI_EXPECT_SERVER_ADDR:'192.0.2.1'},'bootstrap server identity mismatch');
 sql('create role ar_ci_guard_existing nologin');
 rejected('preexisting-custom-role',{},'already has custom roles');sql('drop role ar_ci_guard_existing');
 tool('createdb',['--no-password','ar_ci_guard_existing']);
 rejected('preexisting-database',{},'Service cluster is not fresh');tool('dropdb',['--no-password','ar_ci_guard_existing']);
 sql('create table public.ar_ci_guard_existing(id integer)');
 rejected('preexisting-bootstrap-table',{},'bootstrap is not empty');sql('drop table public.ar_ci_guard_existing');
 // A hostile inherited libpq override cannot redirect the child to another host.
 sql('create role ar_ci_guard_existing nologin');
 rejected('libpq-overrides-scrubbed',{PGHOSTADDR:'192.0.2.1',PGSERVICE:'synthetic-untrusted-service',PGSERVICEFILE:join(dir,'absent'),PGOPTIONS:'-c role=postgres'},'already has custom roles');
 sql('drop role ar_ci_guard_existing');
}finally{
 if(started)tool('pg_ctl',['-D',cluster,'-m','fast','-w','-t','60','stop'],true);
 writeFileSync(join(dir,'report.json'),JSON.stringify({synthetic:true,passed:results,expected:10},null,2));console.log('Guard-test report: '+join(dir,'report.json'));
}
