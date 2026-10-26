import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {isIP} from 'node:net';

/** Uses only the caller's already migrated fresh synthetic loopback database. */
export async function verifyCombinedEmailContract({root,runDir,executable,env,database,expectedAddress,port}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||!['127.0.0.1','localhost','::1'].includes(env.PGHOST)||env.PGHOSTADDR&&!['127.0.0.1','::1'].includes(env.PGHOSTADDR)||String(env.PGPORT)!==String(port)||!isIP(expectedAddress)||env.PGSERVICE||env.PGSERVICEFILE)throw Error('Synthetic combined contract scope required');
 const psql=executable('psql');
 const identity=spawnSync(psql,['-X','--no-password','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-c',"select current_database()||'|'||host(inet_server_addr())"],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:15000});
 if(identity.status!==0||identity.stdout.trim()!==database+'|'+expectedAddress)throw Error('Synthetic combined contract identity mismatch');
 const file=join(runDir,'combined-contract-private-'+randomUUID()+'.json');
 // The only credential carrier is an untracked private file, never arguments,
 // test output or a Vite/browser environment variable.
 writeFileSync(file,JSON.stringify({psql,env,database,expectedAddress,port,nonce:randomUUID()}),{mode:0o600,flag:'wx'});
 try{
  const run=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','tests/combined-email-sql-contract.test.ts','tests/document-command-abandon.test.ts'],{cwd:root,env:{...process.env,AR_SYNTHETIC_SQL_CONNECTION_FILE:file},windowsHide:true,encoding:'utf8',timeout:120000});
  writeFileSync(join(runDir,'combined-email-sql-contract-vitest.log'),(run.stdout??'')+'\n'+(run.stderr??''));
  if(run.status!==0||!/6 passed/.test(run.stdout)||/\bskipped\b/.test(run.stdout))throw Error('Combined Worker/SQL contract failed\n'+run.stdout+'\n'+run.stderr);
  const evidence={synthetic:true,workerHttp:true,realSql:true,scenarios:['plain','signed','accepted-history-failure'],providerPostsPerScenario:1,rolledBack:true};
  writeFileSync(join(runDir,'combined-email-sql-contract.json'),JSON.stringify(evidence,null,2));return evidence;
 }finally{unlinkSync(file);}
}
