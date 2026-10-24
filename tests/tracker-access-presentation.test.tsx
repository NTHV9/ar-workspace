import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorkspaceAccessContext} from '../src/access/context';
import {TrackerSheetStatus} from '../src/reports/TrackerSheetStatus';
it.each([null,{email:'member@example.invalid',administrator:false,regions:['phuket' as const],revision:1}])('shows only last successful synchronization while context is unresolved or an ordinary member',member=>{
 const html=renderToStaticMarkup(<WorkspaceAccessContext.Provider value={member}><TrackerSheetStatus token="synthetic" region="phuket"/></WorkspaceAccessContext.Provider>);
 expect(html).toContain('Last successful synchronization:');expect(html).not.toContain('Checking tracker connection');expect(html).not.toContain('<button');
});
