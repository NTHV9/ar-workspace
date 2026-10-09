import {hotelRegion,isHotelId,isRegionId,type RegionId} from './hotels';
export const REGION_MAILBOXES = Object.freeze({phuket:'ar@katathani.com','khao-lak':'ar@thesandskhaolak.com'} as const);
export type MailboxId = RegionId;
export const mailboxSender=(mailbox:MailboxId)=>REGION_MAILBOXES[mailbox];
export function hotelMailbox(hotel:unknown):MailboxId {if(!isHotelId(hotel))throw Error('email_invalid');return hotelRegion(hotel);}
export function parseMailbox(value:unknown):MailboxId {if(!isRegionId(value))throw Error('email_invalid');return value;}
/** Missing identity is accepted only for preserved, pre-regional Phuket records. */
export function frozenMailIdentity(expected:{mailbox?:unknown;sender?:unknown}):{mailbox:MailboxId;sender:string} {
 if(expected.mailbox===undefined&&expected.sender===undefined)return {mailbox:'phuket',sender:REGION_MAILBOXES.phuket};
 const mailbox=parseMailbox(expected.mailbox),sender=mailboxSender(mailbox);
 if(expected.sender!==sender)throw Error('email_forbidden');return {mailbox,sender};
}
