import {afterEach,expect,it,vi} from 'vitest';
import {documentApi} from '../worker/documents/api';
const owner='00000000-0000-4000-8000-000000000001',command='00000000-0000-4000-8000-000000000003',digest='a'.repeat(64);
afterEach(()=>vi.unstubAllGlobals());
it('accepts exact unknown-create abandonment without repeating create or dispatch',async()=>{
 const fetcher=vi.fn(async()=>Response.json({commandKey:command,payloadDigest:digest,hotel:'KAT',outcome:'cancelled'}));vi.stubGlobal('fetch',fetcher);
 const r=await documentApi(new Request(`https://app.test/api/documents/commands/${command}/abandon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotel:'KAT',payloadDigest:digest})}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:owner},owner,{});
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({commandKey:command,outcome:'cancelled'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('replays a settled protected command receipt without a new abandon decision',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url.split('/').at(-1)!);if(url.endsWith('/ar_document_command_abandon'))return Response.json({commandKey:command,payloadDigest:digest,hotel:'KAT',job_id:owner,job:{id:owner},outcome:'protected'});throw Error('A settled protected request must not be re-abandoned');});
 const r=await documentApi(new Request(`https://app.test/api/documents/commands/${command}/abandon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotel:'KAT',payloadDigest:digest})}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:owner},owner,{});
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({outcome:'protected',job:{id:owner}});expect(calls).toEqual(['ar_document_command_abandon']);
});

const connection=process.env.AR_SYNTHETIC_SQL_CONNECTION_FILE;
it.skipIf(!connection)('real SQL protected receipt survives lost Worker HTTP response and provider settlement without a new abandon',async()=>{
 const {readFileSync}=await import('node:fs'),{spawnSync}=await import('node:child_process'),{randomUUID}=await import('node:crypto');
 const {isIP}=await import('node:net');const c=JSON.parse(readFileSync(connection!,'utf8'));if(!/^ar_ci_[a-z0-9_]+$/.test(c.database)||c.env.PGHOST!=='127.0.0.1'||String(c.env.PGPORT)!==String(c.port)||isIP(c.expectedAddress)!==4||c.env.PGHOSTADDR&&!['127.0.0.1','::1'].includes(c.env.PGHOSTADDR)||!c.nonce||c.env.PGSERVICE||c.env.PGSERVICEFILE)throw Error('Exact isolated SQL scope required');
 const literal=(v:unknown)=>"'"+String(v).replaceAll("'","''")+"'";
 const sql=(query:string)=>{const r=spawnSync(c.psql,['-X','--no-password','-qAt','-d',c.database,'-v','ON_ERROR_STOP=1','-c',query],{env:c.env,windowsHide:true,encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('Synthetic command SQL failed: '+r.stderr);return JSON.parse(r.stdout.trim());};
 expect(sql("select jsonb_build_array(current_database(),host(inet_server_addr()))")).toEqual([c.database,c.expectedAddress]);
 const actor=sql("select to_jsonb(ar_private.access_owner())"),command=randomUUID(),scope='SYNTHETIC-HTTP-EXIT-'+randomUUID(),mail=randomUUID();
 const seed=sql(`do $$declare j jsonb;jid uuid;fid uuid;key text;d jsonb;begin
 perform set_config('ar.document_lifecycle','transient',true);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',${literal(scope)},'Synthetic command HTTP','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',${literal(scope)},'A',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v5('${actor}','${command}','KAT',${literal(scope)},array['A'],'statement','combined','billing','workspace');jid:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_claim_file(jid,fid);perform public.ar_document_finish_file(jid,fid,'jobs/'||jid||'/originals/'||fid||'.pdf',100,repeat('a',64));key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload('${actor}',jid,key,100,repeat('b',64));perform public.ar_document_register_upload(jid,key,100,repeat('b',64),'application/pdf');perform public.ar_document_review('${actor}',jid,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64))),true);d:=public.ar_email_open('${actor}',jid,1);
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values('${mail}','${actor}',(d->>'id')::uuid,0,'draft','<${mail}@synthetic.invalid>',jsonb_build_object('draft',d,'expected','{"mailbox":"phuket","sender":"ar@katathani.com"}'::jsonb,'manifest',jsonb_build_array(jsonb_build_object('open',100)),'workflow','[]'::jsonb),'created');end$$;
 select jsonb_build_object('id',job_id,'digest',request_digest) from ar_private.document_commands where owner='${actor}' and command_key='${command}';`);
 const calls:string[]=[],types:Record<string,Record<string,string>>={ar_document_command_abandon:{p_actor:'uuid',p_owner:'uuid',p_command_key:'uuid',p_hotel:'text',p_payload_digest:'text'},ar_document_abandon:{p_actor:'uuid',p_job_id:'uuid'}};
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{const u=new URL(url),name=u.pathname.split('/').at(-1)!;if(u.origin!=='https://synthetic.supabase.co'||!types[name])throw Error('Unexpected network boundary');calls.push(name);const args=JSON.parse(String(init?.body));const named=Object.entries(args).map(([key,value])=>{const type=types[name][key];if(!type)throw Error('Unexpected SQL argument');return key+'=>'+literal(value)+'::'+type;});return Response.json(sql('select to_jsonb(public.'+name+'('+named.join(',')+'))'));});
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor};const request=()=>new Request(`https://app.test/api/documents/commands/${command}/abandon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotel:'KAT',payloadDigest:seed.digest})});
 const first=await documentApi(request(),env,actor,{});expect(first.status).toBe(200);expect(await first.json()).toMatchObject({outcome:'protected',job:{id:seed.id}});expect(calls.filter(n=>n==='ar_document_abandon')).toHaveLength(1);
 // Do not acknowledge the first HTTP result to any browser/outbox. Provider then settles.
 sql(`update ar_private.mail_deliveries set state='sent' where id='${mail}';select to_jsonb(true);`);
 const before=sql(`select jsonb_build_object('reason',closed_reason,'requested',discard_requested_at,'mail',(select state from ar_private.mail_deliveries where id='${mail}')) from public.ar_document_jobs where id='${seed.id}'`);
 const replay=await documentApi(request(),env,actor,{});expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({outcome:'protected',job:{id:seed.id},commandKey:command});expect(calls.filter(n=>n==='ar_document_abandon')).toHaveLength(1);
 expect(sql(`select jsonb_build_object('reason',closed_reason,'requested',discard_requested_at,'mail',(select state from ar_private.mail_deliveries where id='${mail}')) from public.ar_document_jobs where id='${seed.id}'`)).toEqual(before);expect(before).toMatchObject({reason:'sent',requested:null,mail:'sent'});
},60000);
