import {afterEach,expect,it,vi} from 'vitest';
import {documentResources} from '../worker/documents/resources';
afterEach(()=>vi.unstubAllGlobals());
it('shares only a hotel-scoped template and token; every account read still reaches OPERA',async()=>{
 let templates=0,tokens=0,accounts=0;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const r=new Request(input,init),url=new URL(r.url);
  if(url.pathname.endsWith('ar_invoice_template')){templates++;return Response.json({version:'synthetic'});}
  if(url.pathname.endsWith('/tokens')){tokens++;return Response.json({access_token:'synthetic',expires_in:3600});}
  accounts++;return Response.json({accountDetails:{read:accounts}});
 });
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',OPERA_BASE_URL:'https://synthetic.opera.invalid',OPERA_HOTEL_IDS:'KAT,TSK',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',OPERA_ENTERPRISE_ID:'synthetic'};
 const context=documentResources(env,'KAT');await Promise.all([context.invoiceAssets('synthetic'),context.invoiceAssets('synthetic')]);expect(templates).toBe(1);
 await Promise.all([context.reader().account('A'),context.reader().account('A')]);expect(tokens).toBe(1);expect(accounts).toBe(2);
 await documentResources(env,'TSK').invoiceAssets('synthetic');expect(templates).toBe(2);
});
