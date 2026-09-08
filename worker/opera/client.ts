export type OperaErrorCode = 'invalid_configuration'|'invalid_request'|'redirect_rejected'|'provider_unavailable'|'provider_unauthorized'|'provider_rejected'|'response_too_large'|'invalid_response'|'timeout'|'duplicate_member'|'pagination_incomplete'|'pagination_changed';
export class OperaError extends Error {
  constructor(readonly code: OperaErrorCode,readonly upstreamStatus?:number,readonly stage?:string,readonly providerMessage?:string) { super(code); this.name='OperaError'; }
}
export interface OperaReadConfig { origin:string; appKey:string; hotelId:string; timeoutMs?:number; maxResponseBytes?:number }
export type FetchPort = (request:Request)=>Promise<Response>;

/** Read-only property API surface. No caller-supplied URL or accounting mutation method. */
export class OperaReader {
  private readonly origin:string;
  private readonly timeoutMs:number;
  private readonly maxResponseBytes:number;
  constructor(private readonly config:OperaReadConfig, private readonly getToken:()=>Promise<string>,private readonly transport:FetchPort=request=>fetch(request)) {
    let url:URL;
    try { url=new URL(config.origin); } catch { throw new OperaError('invalid_configuration'); }
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!config.appKey.trim()||!config.hotelId.trim())throw new OperaError('invalid_configuration');
    this.origin=url.origin;
    this.timeoutMs=config.timeoutMs??20000;this.maxResponseBytes=config.maxResponseBytes??8*1024*1024;
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||!Number.isSafeInteger(this.maxResponseBytes)||this.maxResponseBytes<=0)throw new OperaError('invalid_configuration');
  }
  private id(value:string) {
    if(!value||value.length>2000||value==='.'||value==='..')throw new OperaError('invalid_request');
    return encodeURIComponent(value);
  }
  private page(offset:number,limit:number) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1)throw new OperaError('invalid_request');
    return [['offset',String(offset)],['limit',String(limit)]];
  }
  accounts(offset=0,limit=50) {
    return this.read('/ars/v1/accounts',[['balance','All'],['hotelIds',this.config.hotelId],...this.page(offset,limit)]);
  }
  account(accountId:string) {
    return this.read(`/ars/v1/hotels/${this.id(this.config.hotelId)}/accounts/${this.id(accountId)}`,['Account','Summary','Invoices','Aging','Payments'].map(section=>['fetchInstructions',section]));
  }
  history(accountId:string,offset=0,limit=50) {
    return this.read(`/ars/v1/invoicePayments/accounts/${this.id(accountId)}`,[['inclZeroBalance','true'],['inclDetails','true'],['hotelIds',this.config.hotelId],['fetchInstructions','Invoices'],['fetchInstructions','Payments'],...this.page(offset,limit)]);
  }
  businessDate() { return this.read(`/bof/v1/hotels/${this.id(this.config.hotelId)}/businessDate`,[]); }
  private async read(path:string,query:string[][]):Promise<unknown> {
    let token:string;
    try {token=await this.getToken();} catch(e) {throw e instanceof OperaError?e:new OperaError('provider_unauthorized');}
    if(!token)throw new OperaError('provider_unauthorized');
    const url=new URL(path,this.origin);url.search=new URLSearchParams(query).toString();
    if(url.origin!==this.origin)throw new OperaError('invalid_request');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.transport(new Request(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,'x-app-key':this.config.appKey,'x-hotelid':this.config.hotelId,Accept:'application/json'},redirect:'manual',signal:controller.signal}));
      if(response.status>=300&&response.status<400){await response.body?.cancel();throw new OperaError('redirect_rejected');}
      if(!response.ok){
        let providerMessage: string|undefined;
        // Discovery has only owner-confirmed hotel IDs and pagination inputs. Inspect bounded
        // validation title/detail only, never return account payloads or token endpoint bodies.
        if(response.status===400&&path==='/ars/v1/accounts'&&response.body){
          const reader=response.body.getReader();let text='';const decoder=new TextDecoder();let bytes=0;
          try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>4096){await reader.cancel();break;}text+=decoder.decode(p.value,{stream:true});}
            const error=JSON.parse(text);providerMessage=[error.title,error.detail,error['o:errorCode']].filter(v=>typeof v==='string').join(' · ').replaceAll(token,'[redacted]').replaceAll(this.config.appKey,'[redacted]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').slice(0,400);
          }catch{/* only the categorical status survives unreadable errors */}finally{reader.releaseLock();}
        }else await response.body?.cancel();
        throw new OperaError(response.status===401||response.status===403?'provider_unauthorized':response.status>=500||response.status===429?'provider_unavailable':'provider_rejected',response.status,undefined,providerMessage);
      }
      if(!response.headers.get('Content-Type')?.toLowerCase().includes('json')){await response.body?.cancel();throw new OperaError('invalid_response');}
      const declared=Number(response.headers.get('Content-Length'));
      if(declared>this.maxResponseBytes){await response.body?.cancel();throw new OperaError('response_too_large');}
      if(!response.body)throw new OperaError('invalid_response');
      const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try {
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>this.maxResponseBytes){await reader.cancel();throw new OperaError('response_too_large');}chunks.push(part.value);}
      } finally { reader.releaseLock(); }
      const bytes=new Uint8Array(size);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.byteLength;}
      try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {throw new OperaError('invalid_response');}
    } catch(error) {
      if(error instanceof OperaError)throw error;
      // Never propagate upstream response bodies, request URLs, headers or credentials into logs/errors.
      throw new OperaError(controller.signal.aborted?'timeout':'provider_unavailable');
    } finally { clearTimeout(timer); }
  }
}
