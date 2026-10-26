import type {HotelId} from '../domain/hotels';
import type {MailboxId} from '../domain/mailboxes';
import type {RichMessage} from './rich-message';
export interface CombinedMemberInput {memberId:string;documentJobId:string;documentRevision:number;draftId:string;draftRevision:number;stage:string|null;policyVersion:number|null}
export interface CombinedContent {recipients:{to:string[];cc:string[];bcc:string[]};subject:string;body:string;richBody:RichMessage|null;signatureHotel:HotelId}
export interface CombinedDeliveryView {preparationRetirement?:{accepted:true};id:string;state:string;mode:string;gmailAccepted?:boolean;recorded?:boolean;reason?:string|null;stage?:string|null;stageLabel?:string|null;sentAt?:string|null}
export interface CombinedEmail {id:string;revision:number;members:(CombinedMemberInput&{hotel:HotelId;accountId:string;accountName:string;invoiceIds:string[];purpose:'billing'|'collection';layout:string;stageLabel:string|null;files:{fileId:string;name:string;byteCount:number;sha256:string}[]})[];content:CombinedContent;mailbox:MailboxId;totals:{accounts:number;invoices:number;files:number;bytes:number};delivery:CombinedDeliveryView|null}
