import { expect,it } from 'vitest';
import { createTokenProvider } from '../worker/opera/auth';
const auth=JSON.stringify({grantType:'client_credentials',clientId:'synthetic-client',clientSecret:'synthetic-secret',appKey:'synthetic-key',scope:'synthetic-scope'});
it('authenticates only against the confirmed gateway and reuses an unexpired token',async()=>{
  let requests=0;let captured:Request|undefined;
  const getToken=createTokenProvider('https://gateway.example.com','SYNTHETIC',auth,async req=>{requests++;captured=req;return Response.json({access_token:'synthetic-token',expires_in:3600,token_type:'Bearer'});});
  expect(await getToken()).toBe('synthetic-token');expect(await getToken()).toBe('synthetic-token');
  expect(requests).toBe(1);expect(captured!.url).toBe('https://gateway.example.com/oauth/v1/tokens');
  expect(captured!.headers.get('enterpriseId')).toBe('SYNTHETIC');
  expect(new URLSearchParams(await captured!.text()).get('grant_type')).toBe('client_credentials');
});
it('supports password grant without treating enterprise scope as a username',async()=>{
  let captured:Request|undefined;
  const secret=JSON.stringify({grantType:'password',clientId:'synthetic-client',clientSecret:'synthetic-secret',appKey:'synthetic-key',username:'synthetic-user',password:'synthetic-password'});
  const getToken=createTokenProvider('https://gateway.example.com','',secret,async r=>{captured=r;return Response.json({access_token:'synthetic-token',expires_in:3600});});
  await getToken();const body=new URLSearchParams(await captured!.text());expect(body.get('username')).toBe('synthetic-user');expect(body.has('scope')).toBe(false);
});
it('does not expose the upstream authentication body in an error',async()=>{
  const getToken=createTokenProvider('https://gateway.example.com','SYNTHETIC',auth,async()=>new Response('private failure detail',{status:401}));
  await expect(getToken()).rejects.toMatchObject({code:'provider_unauthorized',message:'provider_unauthorized:authentication'});
});
