import {describe,it,expect} from 'vitest';
import {accountFieldIssues,policyFieldIssues,historyFieldIssues} from '../src/settings/form-validation';
import {defaultCollectionPolicy} from '../src/domain/collection-policy';
import {internalWorkspaceParams} from '../src/navigation';
describe('located form feedback preserves validation boundaries',()=>{
 it('distinguishes missing and zero terms and finds a duplicate in its own recipient profile',()=>{
  const form={term:'',portal:'',recipients:{billing_to:'one@example.com',billing_cc:'ONE@example.com',collection_to:'one@example.com'},billingInstructions:'',collectionInstructions:''};
  expect(accountFieldIssues(form)).toEqual({billing_cc:'This address is already used in this recipient profile.'});expect(accountFieldIssues({...form,term:'0',recipients:{}})).toEqual({});expect(accountFieldIssues({...form,term:'-1'})).toHaveProperty('term');
 });
 it('keeps invalid saved portal information discoverable even when another billing type is chosen',()=>{expect(accountFieldIssues({term:'30',portal:'http://example.com',recipients:{},billingInstructions:'',collectionInstructions:''})).toHaveProperty('portal');});
 it('identifies duplicate labels, backward offsets and terminal placement without creating a command',()=>{
  const rounds=structuredClone(defaultCollectionPolicy.rounds);rounds[1].label=rounds[0].label;rounds[2].offsetDays=-1;rounds[4].terminal=false;const issues=policyFieldIssues(rounds,{},'Reason');expect(issues).toHaveProperty('round-0-label');expect(issues).toHaveProperty('round-2-days');expect(issues).toHaveProperty('round-4-terminal');
 });
 it('accepts the saved sequence and identifies the actual invalid date',()=>{expect(policyFieldIssues(defaultCollectionPolicy.rounds,{},'Approved timing')).toEqual({});expect(historyFieldIssues('2026-09-29','Follow 1','2026-09-28','2026-09-28')).toEqual({billing:'Use a valid actual date no later than today.'});expect(historyFieldIssues('','Follow 1','','2026-09-28')).toHaveProperty('sent');});
});
describe('internal app links',()=>{
 const scope=new URLSearchParams('region=khao-lak&hotel=TLKL');
 it('retains scope and normalizes a supported historic bookmark',()=>{const next=internalWorkspaceParams('/?financial=1','https://app.example',scope)!;expect(next.get('region')).toBe('khao-lak');expect(next.get('dashboardDetail')).toBe('payments');expect(next.has('financial')).toBe(false);});
 it('respects an explicitly linked hotel rather than retaining a different region',()=>{const next=internalWorkspaceParams('/?account=A&property=KAT','https://app.example',scope)!;expect(next.get('region')).toBe('phuket');expect(next.get('hotel')).toBe('KAT');expect(next.get('account')).toBe('A');});
 it('never intercepts documents, callbacks, external or malformed URLs',()=>{for(const href of ['/api/documents/1','#details','/?code=one-time','https://other.example/','http://[bad','https://user:pass@app.example/'])expect(internalWorkspaceParams(href,'https://app.example',scope)).toBeNull();});
});
