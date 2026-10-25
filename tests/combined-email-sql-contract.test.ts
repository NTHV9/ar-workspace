import {it,expect,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {emailApi} from '../worker/email/api';
import {plainMessage,richText} from '../src/email/rich-message';

vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
const connection=process.env.AR_SYNTHETIC_SQL_CONNECTION_FILE;
const literal=(v:unknown)=>v===null?'null':"'"+String(v).replace(/'/g,"''")+"'";
const allowed=['ar_combined_email_save','ar_combined_email_get','ar_combined_mail_claim','ar_email_get','ar_email_business_preflight','ar_document_get','ar_mail_get','ar_mail_record','ar_mail_confirm_sent'];

/** One outer transaction preserves an accepted provider receipt across a failed
 * RPC subtransaction and rolls back every immutable business fact at teardown. */
async function database(){
 const c=JSON.parse(readFileSync(connection!,'utf8'));
 if(!/^ar_ci_[a-z0-9_]+$/.test(c.database)||!['127.0.0.1','localhost','::1'].includes(c.env.PGHOST)||c.env.PGHOSTADDR&&!['127.0.0.1','::1'].includes(c.env.PGHOSTADDR)||String(c.env.PGPORT)!==String(c.port)||!isIP(c.expectedAddress)||c.env.PGSERVICE||c.env.PGSERVICEFILE||!c.nonce)throw Error('Private synthetic loopback configuration required');
 const child=spawn(c.psql,['-X','--no-password','-qAt','-d',c.database,'-v','ON_ERROR_STOP=1'],{env:c.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',failed=false;const listeners=new Set<()=>void>();
 child.stdout.on('data',v=>{output+=v.toString();for(const f of listeners)f();});
 child.stderr.on('data',()=>{failed=true;for(const f of listeners)f();});
 child.on('error',()=>{failed=true;for(const f of listeners)f();});
 child.on('exit',()=>{failed=true;for(const f of listeners)f();});
 async function sql(q:string):Promise<any>{
  const marker='END_'+randomUUID().replaceAll('-','');output='';
  child.stdin.write(q+';\n\\echo '+marker+'\n');
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Synthetic SQL deadline')),15000);const tick=()=>{if(output.includes(marker))finish();else if(failed)finish(Error('Synthetic SQL command failed'));};const finish=(error?:Error)=>{clearTimeout(timer);listeners.delete(tick);error?reject(error):resolve();};listeners.add(tick);tick();});
  const lines=output.slice(0,output.indexOf(marker)).trim();return lines?JSON.parse(lines):null;
 }
 try{
 const identity=await sql("select jsonb_build_array(current_database(),host(inet_server_addr()))");expect(identity).toEqual([c.database,c.expectedAddress]);
 await sql("set time zone 'UTC'");
 await sql('begin');
 await sql(`create function pg_temp.http_rpc(q text) returns jsonb language plpgsql as $$declare result jsonb;begin execute q into result;return jsonb_build_object('status',200,'body',result);exception when others then return jsonb_build_object('status',400,'body',jsonb_build_object('message',sqlerrm,'code',sqlstate));end$$`);
 await sql(readFileSync(new URL('./sql/combined-email-contract-seed.sql',import.meta.url),'utf8'));
 const signatures=await sql(`select jsonb_object_agg(proname,args) from (select p.proname,jsonb_object_agg(p.proargnames[s.i],format_type(p.proargtypes[s.i-1],null)) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral generate_series(1,p.pronargs) s(i) where n.nspname='public' and p.proname in (${allowed.map(literal).join(',')}) group by p.oid,p.proname)x`);
 return {sql,async rpc(name:string,args:Record<string,unknown>){
  if(!allowed.includes(name)||!signatures[name])throw Error('Unexpected RPC boundary '+name);
  const params=Object.entries(args).map(([key,value])=>{const type=signatures[name][key];if(!type||!/^[a-z0-9_ ]+(\[\])?$/.test(type)||!/^p_[a-z_]+$/.test(key))throw Error('Unexpected typed SQL argument');return key+'=>'+literal(value===null?null:typeof value==='object'?JSON.stringify(value):value)+'::'+type;});
  const result=await sql('select pg_temp.http_rpc('+literal('select to_jsonb(public.'+name+'('+params.join(',')+'))')+')');return Response.json(result.body,{status:result.status});
 },async close(){try{if(!failed)await sql('rollback');}finally{child.stdin.end('\\q\n');await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',()=>resolve());setTimeout(()=>{child.kill();resolve();},2000).unref();});}}};
 }catch(error){child.stdin.end('rollback;\n\\q\n');child.kill();throw error;}
}

it.skipIf(!connection).each(['plain','signed','accepted-history-failure'])('actual email HTTP → production SQL → one synthetic Gmail POST: %s',async mode=>{
 const db=await database();const files=Object.fromEntries(['KAT','TSK'].map(hotel=>[hotel,new TextEncoder().encode('%PDF-1.7\nSynthetic reviewed '+hotel+' export\n%%EOF')]));
 const digests=Object.fromEntries(Object.entries(files).map(([hotel,bytes])=>[hotel,createHash('sha256').update(bytes).digest('hex')]));
 const posts:string[]=[],storageReads:string[]=[],rpcNames:string[]=[],metadataReads:string[]=[],boundaryErrors:unknown[]=[];
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-only'};
 try{
  const seed=await db.sql(`select pg_temp.combined_seed(${literal(JSON.stringify(digests))}::jsonb,${files.KAT.length})`);
  const before=await db.sql(`select jsonb_agg(jsonb_build_object('id',id,'recipients',recipients,'subject',subject,'body',body) order by id) from public.ar_email_drafts where document_job_id in (${seed.members.map((m:any)=>literal(m.documentJobId)+'::uuid').join(',')})`);
  const settings=()=>db.sql(`select jsonb_agg(to_jsonb(s) order by hotel) from public.ar_account_settings s where account_id=${literal(seed.scope)}`);
  const originalSettings=await settings();
  const id=randomUUID(),commandId=randomUUID();let historyFailure=mode==='accepted-history-failure';
  vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
   const url=String(input),u=new URL(url);
   if(u.origin==='https://synthetic.supabase.co'&&u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1)!;rpcNames.push(name);try{const r=await db.rpc(name,JSON.parse(String(init.body)));if(!r.ok)boundaryErrors.push(await r.clone().json());return r;}catch(e){boundaryErrors.push(String(e));throw e;}}
   if(u.origin==='https://synthetic.supabase.co'&&u.pathname.startsWith('/storage/v1/object/authenticated/')){
    if(init.method&&init.method!=='GET')throw Error('Unexpected storage write');
    const key=u.pathname.split('/').slice(6).join('/');
    const hotel=await db.sql(`select to_jsonb(j.hotel) from public.ar_document_jobs j cross join lateral jsonb_array_elements(j.exports) x where j.owner=${literal(seed.actor)}::uuid and j.account_id=${literal(seed.scope)} and x->>'storage_key'=${literal(key)}`);
    if(!files[hotel])throw Error('Unowned synthetic storage object');storageReads.push(key);return new Response(files[hotel]);
   }
   if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'&&init.method==='POST'){
    posts.push(Buffer.from(JSON.parse(String(init.body)).raw,'base64url').toString('utf8'));
    if(historyFailure)await db.sql("select to_jsonb(set_config('ar.synthetic_http_failure','on',true))");
    return Response.json({id:'syntheticAccepted'});
   }
   if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/syntheticAccepted?format=metadata'){
    metadataReads.push(url);return Response.json({id:'syntheticAccepted',labelIds:['SENT'],internalDate:String(Date.now())});
   }
   throw Error('Unexpected network boundary '+u.origin+u.pathname);
  });
  const richBody=mode==='signed'?{...plainMessage('Common synthetic message'),signature:{staffId:seed.actor,name:'Synthetic staff',title:'Accounts Receivable',workplace:'Katathani Phuket Beach Resort'}}:null;
  const content={recipients:{to:['manual.to@example.invalid'],cc:['manual.cc@example.invalid'],bcc:['manual.bcc@example.invalid']},subject:'Common synthetic subject',body:richBody?richText(richBody):'Common synthetic message',richBody,signatureHotel:'KAT'};
  const request=(path:string,body:unknown)=>new Request('https://app.test/api/email/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const saved=await emailApi(request('combined',{id,revision:0,commandId:randomUUID(),members:seed.members,content}),env,seed.actor);
  const prep=await saved.json() as any;expect({status:saved.status,body:prep}).toMatchObject({status:200,body:{revision:1}});
  expect(await db.sql(`select jsonb_agg(jsonb_build_object('id',id,'recipients',recipients,'subject',subject,'body',body) order by id) from public.ar_email_drafts where document_job_id in (${seed.members.map((m:any)=>literal(m.documentJobId)+'::uuid').join(',')})`)).toEqual(before);
  expect(prep.members.map((m:any)=>m.hotel)).toEqual(['KAT','TSK']);
  const send=()=>emailApi(request('combined/'+id+'/send',{revision:1,commandId,confirmed:true}),env,seed.actor);
  const response=await send();const first=await response.json();expect(response.status,JSON.stringify({body:first,rpcNames,boundaryErrors})).toBe(200);
  expect(first).toMatchObject(historyFailure?{gmailAccepted:true,recorded:false,reason:'history_recording_unavailable'}:{state:'sent',recorded:true});
  await send();expect(posts).toHaveLength(1);expect(storageReads).toHaveLength(2);
  expect(new Set(storageReads).size).toBe(2);
  for(const kind of ['To','Cc','Bcc'])expect(posts[0]).toMatch(new RegExp(kind+': manual\\.'+kind.toLowerCase()+'@example.invalid','i'));
  for(const member of prep.members)expect(posts[0]).toContain('filename="'+member.files[0].name+'"');
  expect((posts[0].match(/Content-Disposition: attachment/g)??[])).toHaveLength(2);
  const attachments=[...posts[0].matchAll(/Content-Disposition: attachment;[\s\S]*?Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)(?=--)/g)].map(m=>createHash('sha256').update(Buffer.from(m[1],'base64')).digest('hex'));
  expect(attachments).toEqual([digests.KAT,digests.TSK]);
  const plain=/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)(?=--)/.exec(posts[0]);expect(plain).not.toBeNull();expect(Buffer.from(plain![1],'base64').toString('utf8')).toBe(content.body);
  expect(posts[0]).not.toContain('.ordinary@example.invalid');
  expect((posts[0].match(/Content-ID:/g)??[])).toHaveLength(mode==='signed'?1:0);
  if(historyFailure){
   expect(await db.sql(`select count(*)::integer from ar_private.combined_sent_scopes where delivery_id=${literal(commandId)}::uuid`)).toBe(0);
   expect(await db.sql(`select to_jsonb(provider_receipt_id) from ar_private.mail_deliveries where id=${literal(commandId)}::uuid`)).toBe('syntheticAccepted');
   historyFailure=false;await db.sql("select to_jsonb(set_config('ar.synthetic_http_failure','off',true))");
   const checked=await emailApi(request('deliveries/'+commandId+'/check',{}),env,seed.actor);expect(await checked.json()).toMatchObject({state:'sent',recorded:true});expect(metadataReads).toHaveLength(1);
  }
  expect(posts).toHaveLength(1);
  // Business dates belong to Bangkok even when PostgreSQL and the CI host use
  // UTC. Derive the expected day from this exact durable send, avoiding a race
  // against either clock at midnight and keeping the assertion independent of SQL.
  const sentAt=await db.sql(`select to_jsonb(sent_at) from ar_private.mail_deliveries where id=${literal(commandId)}::uuid`);
  expect(typeof sentAt).toBe('string');expect(Number.isFinite(Date.parse(sentAt))).toBe(true);
  const bangkokDay=new Date(Date.parse(sentAt)+7*60*60*1000).toISOString().slice(0,10);
  const facts=await db.sql(`select jsonb_build_object('roots',(select count(*) from ar_private.mail_deliveries where combined_preparation_id=${literal(id)}::uuid),'children',(select count(*) from ar_private.mail_deliveries where draft_id in (${seed.members.map((m:any)=>literal(m.draftId)+'::uuid').join(',')})),'scopes',(select jsonb_agg(hotel order by hotel) from ar_private.sent_scope_facts where delivery_id=${literal(commandId)}::uuid),'intents',(select jsonb_agg(hotel||':'||invoice_id||':'||field order by hotel) from ar_private.tracker_outbox where delivery_id=${literal(commandId)}::uuid),'current',(select count(*) from public.ar_invoice_workflow where account_id=${literal(seed.scope)} and first_billing_date=${literal(bangkokDay)}::date),'legacyEvents',(select count(*) from public.ar_sent_events where delivery_id=${literal(commandId)}::uuid))`);
  expect(facts).toEqual({roots:1,children:0,scopes:['KAT','TSK'],intents:['KAT:SAME-INVOICE:R','TSK:SAME-INVOICE:R'],current:2,legacyEvents:0});
  expect(await settings()).toEqual(originalSettings);
  expect(before).toHaveLength(2);expect(rpcNames).toContain('ar_combined_mail_claim');expect(rpcNames).toContain('ar_mail_confirm_sent');
 }finally{vi.unstubAllGlobals();await db.close();}
},60000);
