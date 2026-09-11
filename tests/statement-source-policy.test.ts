import {expect,it} from 'vitest';
import {assertStatementWorkflowPolicy,documentSource} from '../worker/documents/source-policy';

it('refuses every retired native Statement workflow without invoking work',()=>{
 for(const flag of ['statementProbe','combinedStatementAudit','statementHistoryAudit','statementPostTrial','reportDiscovery','printedVisibilityAudit'])expect(()=>assertStatementWorkflowPolicy({[flag]:true})).toThrow('document_statement_source_retired');
});
it('continues native Invoice PDF checks and normal document/refresh work',()=>{
 for(const payload of [{pdfProbe:true},{documentJob:true},{}])expect(()=>assertStatementWorkflowPolicy(payload)).not.toThrow();
});
it('validates source even when creation is invoked outside the HTTP handler',()=>{
 expect(documentSource({content:'statement',ids:['A']})).toBe('workspace');
 expect(documentSource({content:'invoices',ids:['A']})).toBe('native');
 expect(()=>documentSource({content:'invoices',statementSource:'workspace',ids:['A']})).toThrow('document_request_invalid');
 expect(()=>documentSource({content:'both',statementSource:'unexpected',ids:['A']})).toThrow('document_request_invalid');
});
