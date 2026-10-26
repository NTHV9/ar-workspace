import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

/** Fresh synthetic runner database only; the first order blocks byte release,
 * the second permanently denies a late draft-send admission. */
export async function verifyPdfReleaseConcurrency({root,runDir,executable,env,database,expectedAddress,port}){
 if(!/^ar_ci_[a-z0-9_]+$/.test(database)||env.PGHOST!=='127.0.0.1'||String(env.PGPORT)!==String(port))throw Error('Synthetic PDF release scope required');
 const args=['-X','--no-password','-d',database,'-v','ON_ERROR_STOP=1','-q','-t','-A'];
 const sync=sql=>{const r=spawnSync(executable('psql'),[...args,'-c',sql],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
 if(sync("select current_database()||'|'||host(inet_server_addr())")!==database+'|'+expectedAddress)throw Error('Synthetic PDF release server mismatch');
 // Reuse only this fixture's synthetic setup, before any assertions/releases.
 const fixture=readFileSync(join(root,'tests/sql/pdf-byte-release-rollback.sql'),'utf8').replaceAll('\r\n','\n');
 const boundary=fixture.indexOf(" if has_function_privilege('authenticated'");if(boundary<0)throw Error('PDF seed boundary changed');
 sync(fixture.slice(0,boundary)+" r:=public.ar_pdf_byte_release_register(actor,cohort,members);end$$;commit;");
 const actor=sync("select public.ar_financial_service_actor()"),cohort=sync('select id from ar_private.pdf_release_cohort');
 const member=JSON.parse(sync("select jsonb_build_object('mail',m.id,'draft',m.draft_id,'revision',m.revision) from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id join ar_private.pdf_release_members b on b.job_id=d.document_job_id where b.cohort_id='"+cohort+"' and m.state='created' order by m.id limit 1"));
 const preview=JSON.parse(sync(`select public.ar_pdf_byte_release_preview('${actor}','${cohort}')`));
 const command=randomUUID(),commit=`public.ar_pdf_byte_release_commit('${actor}','${cohort}','${command}','${preview.inventoryDigest}')`;
 const claim=`public.ar_mail_claim_draft_send('${actor}','${member.mail}',${member.revision},(select snapshot->'expected' from ar_private.mail_deliveries where id='${member.mail}'),null)`;
 const sessions=[];
 function session(label){const child=spawn(executable('psql'),args,{cwd:root,env:{...env,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']});const s={child,out:'',err:'',ended:false};sessions.push(s);child.stdout.on('data',v=>s.out+=v);child.stderr.on('data',v=>s.err+=v);child.on('close',()=>s.ended=true);s.send=sql=>child.stdin.write(sql+'\n');s.wait=async marker=>{const deadline=Date.now()+15000;while(!s.out.includes(marker)&&!s.ended&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));if(!s.out.includes(marker))throw Error('PDF release session failed '+label+' '+s.err);};return s;}
 const evidence=[];
 try{
  for(const releaseFirst of [false,true]){
   const label='pdf-release-'+randomUUID(),a=session(label+'-first'),b=session(label+'-second');
   a.send(`begin;set local lock_timeout='10s';select pg_advisory_xact_lock${releaseFirst?'':'_shared'}(61704,1439);select pg_advisory_xact_lock(hashtextextended('${actor}',735));select 'READY';`);await a.wait('READY');
   // Turn expected safety errors into observable results without losing the
   // owning transaction's eventual COMMIT/ROLLBACK marker.
   b.send(`begin;set local lock_timeout='10s';do $$begin perform ${releaseFirst?claim:commit};raise exception 'UNSAFE_SUCCESS';exception when others then if sqlerrm not in('document_bytes_released','pdf_release_evidence_immutable','pdf_release_inventory_changed') then raise;end if;raise notice 'SAFE_REJECT:%',sqlerrm;end$$;commit;select 'DONE';`);
   let waiting=false;const deadline=Date.now()+10000;while(Date.now()<deadline){if(sync(`select count(*) from pg_stat_activity where application_name='${label}-second' and wait_event_type='Lock'`)==='1'){waiting=true;break;}}
   if(!waiting)throw Error('PDF release contender did not wait');
   a.send(`select 'FIRST:'||${releaseFirst?commit:claim}::text;commit;select 'DONE';`);await Promise.all([a.wait('DONE'),b.wait('DONE')]);
   const first=JSON.parse(a.out.split('\n').find(x=>x.startsWith('FIRST:')).slice(6));
   if(!releaseFirst&&!first.claimed||releaseFirst&&!first.accepted||!b.err.includes('SAFE_REJECT')||/deadlock/i.test(a.err+b.err))throw Error('PDF release ordering failed: '+a.err+b.err);
   evidence.push({releaseFirst,actualLockWait:true,safeRejected:true,noDeadlock:true});
   if(!releaseFirst){
    // Synthetic provider never dispatched: restore its setup to exercise the
    // opposite committed order. No customer/recovery state is modified.
    sync(`update ar_private.mail_deliveries set state='created',draft_send_claimed_at=null,reason=null,provider_receipt_id=null where id='${member.mail}'`);
   }
  }
  writeFileSync(join(runDir,'pdf-byte-release-concurrency.json'),JSON.stringify(evidence,null,2));return evidence;
 }finally{for(const s of sessions)if(!s.ended){s.send('rollback;\n\\q');s.child.stdin.end();}await Promise.all(sessions.map(s=>s.ended?Promise.resolve():new Promise(r=>{s.child.once('close',r);const t=setTimeout(()=>{s.child.kill();r();},2000);t.unref();})));}
}
