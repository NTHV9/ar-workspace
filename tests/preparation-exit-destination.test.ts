import {expect,it} from 'vitest';
import {exitedDocumentDestination} from '../src/preparation/exit-return';
const old='10000000-0000-4000-8000-000000000001',fresh='20000000-0000-4000-8000-000000000001';
it('silently replaces only the exact exited single route and retains ordinary collection filters',()=>{
 const source=new URLSearchParams({documentJob:old,region:'khao-lak',hotel:'WAKL',qstage:'Billing',qpurpose:'billing',compose:'1',gmail:'handoff',account:'synthetic',property:'WAKL'});
 const next=exitedDocumentDestination(source,old)!;
 expect(Object.fromEntries(next)).toEqual({region:'khao-lak',hotel:'WAKL',qstage:'Billing',qpurpose:'billing',collections:'1'});
 expect(source.get('documentJob')).toBe(old);
});
it('cannot redirect a different fresh preparation, a batch or an invalid identity',()=>{
 expect(exitedDocumentDestination(new URLSearchParams({documentJob:fresh}),old)).toBeNull();
 expect(exitedDocumentDestination(new URLSearchParams({documentJob:old,collectionBatch:fresh}),old)).toBeNull();
 expect(exitedDocumentDestination(new URLSearchParams({documentJob:'bad'}),'bad')).toBeNull();
 expect(exitedDocumentDestination(new URLSearchParams({collections:'1'}),old)).toBeNull();
});
