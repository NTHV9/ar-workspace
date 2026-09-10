/** Owner decision: system Statements and native OPERA Invoices are separate sources. */
export function documentSource(input:{content:string;statementSource?:unknown;ids:unknown[]}):'native'|'workspace'{
 if(input.statementSource!==undefined&&input.statementSource!=='native'&&input.statementSource!=='workspace')throw Error('document_request_invalid');
 if(input.content==='invoices'){
  if(input.statementSource==='workspace')throw Error('document_request_invalid');
  return 'native';
 }
 if(!['statement','both'].includes(input.content))throw Error('document_request_invalid');
 if(input.statementSource==='native')throw Error('document_statement_source_retired');
 // The existing in-memory renderer budget applies even when clients omit the source.
 if(input.ids.length>500)throw Error('document_request_invalid');
 return 'workspace';
}

/** Old research flags must not silently resume native Statement calls after a deploy. */
export function assertStatementWorkflowPolicy(payload:Record<string,unknown>){
 if(['statementProbe','combinedStatementAudit','statementHistoryAudit','statementPostTrial','reportDiscovery','printedVisibilityAudit'].some(flag=>payload[flag]))throw Error('document_statement_source_retired');
}
