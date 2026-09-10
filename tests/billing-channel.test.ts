import {it,expect} from 'vitest';
import {parseSettings,parseRecipients} from '../worker/settings/validation';
import {parseAgentRow,matchAgentRows} from '../worker/settings/import';
const empty={to:[],cc:[],bcc:[]};
const base={revision:0,billingRequired:true,creditTerm:0,billingRecipients:empty,collectionRecipients:empty};
it('keeps System billing separate from email and permits a zero-day term',()=>{
 expect(parseSettings({...base,billingMethod:'system',billingPortal:'https://portal.example.test/',billingInstructions:'Use the account portal',collectionInstructions:''})).toMatchObject({creditTerm:0,billingMethod:'system'});
 for(const portal of ['javascript:alert(1)','http://portal.example.test','https://name:password@portal.example.test'])expect(()=>parseSettings({...base,billingMethod:'system',billingPortal:portal})).toThrow();
});
it('does not accept punctuation as part of an email domain',()=>{expect(()=>parseRecipients({...empty,to:["team@example.test'"]})).toThrow();expect(parseRecipients({...empty,to:["o'brien@example.test"]}).to).toHaveLength(1);});
it('imports explicit account numbers, separates instructions, normalizes harmless list delimiters',()=>{
 const r=parseAgentRow({row:3,number:'A001',agent:'Example',term:30,type:'By Email',billing:"billing@example.test'",collection:'one@example.test two@example.test'});
 expect(r.billingRequired).toBe(true);expect(r.billingRecipients.to).toEqual(['billing@example.test']);expect(r.collectionRecipients.to).toEqual(['one@example.test','two@example.test']);
 const notes=parseAgentRow({row:4,number:'B001',agent:'Example',term:0,type:'By System',billing:'DEDUCT DEPOSIT',collection:'collect@example.test'});expect(notes).toMatchObject({creditTerm:0,billingMethod:'system',billingPortal:null,billingInstructions:'DEDUCT DEPOSIT'});expect(notes.billingRecipients.to).toEqual([]);
});
it('keeps note-only billing cells empty and never copies collection recipients',()=>{
 const r=parseAgentRow({row:5,number:'C001',agent:'Example',term:15,type:'By Email',billing:'EXTERNAL FORM',collection:'collect@example.test'});expect(r.billingRecipients.to).toEqual([]);expect(r.billingInstructions).toBe('EXTERNAL FORM');expect(r.warnings).toContain('billing_email_missing');
});
it('does not repair malformed mailbox tokens into a different destination',()=>{
 const row={row:3,number:'A001',agent:'Example',term:30,type:'By Email',billing:'bill@example.test',collection:'collect@example.test'};
 for(const billing of ['bill@example.test..bad','bill@example.test_bad',':bill@example.test'])expect(()=>parseAgentRow({...row,billing})).toThrow('import_email_invalid');
 expect(parseAgentRow({...row,type:'By System',billing:'HTTPS://portal.example.test'}).billingPortal).toBe('https://portal.example.test/');
});
it('rejects malformed terms, duplicate account-number rows and ambiguous property matches',()=>{
 const row={row:3,number:'A001',agent:'Example',term:30,type:'By Email',billing:'bill@example.test',collection:'collect@example.test'};
 expect(()=>parseAgentRow({...row,term:null})).toThrow();expect(()=>parseAgentRow({...row,term:'30 days'})).toThrow();
 const r=parseAgentRow(row),accounts=[{hotel:'KAT',id:'1',account_no:'A001',name:'Example',revision:0}];
 expect(()=>matchAgentRows([r,r],accounts,['KAT'])).toThrow();expect(()=>matchAgentRows([r],[...accounts,{...accounts[0],id:'2'}],['KAT'])).toThrow();
 expect(matchAgentRows([r],[...accounts,{hotel:'TSK',id:'8',account_no:'A001',name:'Example',revision:0}],['KAT']).matched).toHaveLength(1);
});
