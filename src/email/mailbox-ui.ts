import {mailboxSender,type MailboxId} from '../domain/mailboxes';
export interface GmailState {region:MailboxId;expectedEmail:string;configured:boolean;connected:boolean;canRead?:boolean;email?:string;maxAttachmentBytes?:number}
export const gmailUrl=(region:MailboxId,view:string)=>`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailboxSender(region))}#${view}`;
export const testCommandKey=(region:MailboxId)=>`ar-mail-test-command:${region}`;
export function connectedMailbox(status:GmailState|null,region:MailboxId){return !!status&&status.region===region&&status.expectedEmail===mailboxSender(region)&&status.email===mailboxSender(region)&&status.connected;}
