import {expect,it} from 'vitest';
import {connectedMailbox,gmailUrl,testCommandKey} from '../src/email/mailbox-ui';
it('opens Gmail in the sending mailbox and isolates diagnostic command storage',()=>{
 expect(gmailUrl('khao-lak','drafts')).toBe('https://mail.google.com/mail/u/?authuser=ar%40thesandskhaolak.com#drafts');
 expect(gmailUrl('phuket','all/synthetic')).toContain('authuser=ar%40katathani.com#all/synthetic');
 expect(testCommandKey('phuket')).not.toBe(testCommandKey('khao-lak'));
});
it('requires the status identity to match the document mailbox before enabling handoff',()=>{
 const status={region:'khao-lak' as const,expectedEmail:'ar@thesandskhaolak.com',email:'ar@thesandskhaolak.com',configured:true,connected:true,canRead:true};
 expect(connectedMailbox(status,'khao-lak')).toBe(true);
 expect(connectedMailbox(status,'phuket')).toBe(false);
 expect(connectedMailbox({...status,email:'ar@katathani.com'},'khao-lak')).toBe(false);
 expect(connectedMailbox({...status,expectedEmail:'ar@katathani.com'},'khao-lak')).toBe(false);
 expect(connectedMailbox({...status,connected:false},'khao-lak')).toBe(false);
 expect(connectedMailbox(null,'khao-lak')).toBe(false);
});
