import {expect,it} from 'vitest';
import {emailDeliveryStatus} from '../src/email/delivery-status';

it('separates Gmail acceptance from business history recording',()=>{
 expect(emailDeliveryStatus({id:'a',mode:'send',state:'sent',recorded:true}).title).toBe('Sent — history recorded');
 const accepted=emailDeliveryStatus({id:'a',mode:'send',state:'review_required',gmailAccepted:true,reason:'workflow_changed'});
 expect(accepted.title).toBe('Sent — history needs attention');
 expect(accepted.detail).toContain('Gmail accepted');
 expect(accepted.detail).toContain('Do not resend');
 expect(accepted.reason).toContain('Invoice or account');
});
it('labels a created Gmail draft as unsent and an uncertain send without guessing',()=>{
 expect(emailDeliveryStatus({id:'a',mode:'draft',state:'created'}).title).toBe('Gmail draft — not sent');
 for(const state of ['pending','awaiting_sent','review_required']){
  const status=emailDeliveryStatus({id:'a',mode:'send',state});
  expect(status.title).toBe('Send result unknown — do not resend');
  expect(status.tone).toBe('attention');
 }
 expect(emailDeliveryStatus({id:'a',mode:'send',state:'sent',recorded:false}).title).toBe('Send result unknown — do not resend');
});
it.each([
 ['message_recipients','recipients'],['attachment_metadata','names or sizes'],['attachment_content','contents'],['message_body','message text'],['message_html','formatting'],['gmail_receipt_missing','Gmail no longer returns'],['stage_policy_unverified','Collection rules'],['history_recording_unavailable','History could not be saved'],
])('explains %s without exposing backend codes',(reason,explanation)=>{
 const status=emailDeliveryStatus({id:'a',mode:'send',state:'review_required',reason});
 expect(status.reason).toContain(explanation);
 expect(status.reason).not.toContain(reason);
});
