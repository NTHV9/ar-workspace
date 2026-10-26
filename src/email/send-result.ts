import type {EmailDeliveryView} from '../../worker/email/shared';

export type EmailSendResultState = 'sending' | 'sent' | 'history-pending' | 'unconfirmed' | 'partial';
export type EmailSendOutcome = 'sent' | 'history-pending' | 'unconfirmed';

/** Display evidence only: this classifier never grants permission to send. */
export function emailSendOutcome(delivery: EmailDeliveryView | null | undefined): EmailSendOutcome {
 if (delivery?.state === 'sent' && delivery.recorded === true) return 'sent';
 if (delivery?.gmailAccepted === true) return 'history-pending';
 return 'unconfirmed';
}

export interface EmailSendCounts {
 messages: number;
 accounts: number;
 invoices: number;
 files: number | null;
}

export interface EmailSendRecipientGroup {
 key: string;
 label: string;
 recipients: {to: string[]; cc: string[]; bcc: string[]} | null;
}
