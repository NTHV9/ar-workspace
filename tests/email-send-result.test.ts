import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import EmailSendResult, {type EmailSendResultProps} from '../src/email/EmailSendResult';
import {emailSendOutcome} from '../src/email/send-result';

const props: EmailSendResultProps = {
 state: 'sent', counts: {messages: 1, accounts: 1, invoices: 2, files: 3},
 recipientGroups: [{key: 'kat-a', label: 'KAT / Account A', recipients: {to: ['billing@example.test'], cc: ['cc@example.test'], bcc: ['bcc@example.test']}}],
 gmailSentUrl: 'https://mail.google.com/mail/u/0/#sent', onBackToCollections: () => {},
};
const markup = (overrides: Partial<EmailSendResultProps> = {}) => renderToStaticMarkup(createElement(EmailSendResult, {...props, ...overrides}));
const back = (html: string) => html.match(/<button[^>]*>Back to Collections<\/button>/)?.[0] ?? '';

describe('delivery evidence classification', () => {
 it('requires sent and recorded before claiming history recorded', () => {
  expect(emailSendOutcome({id: 'd', mode: 'send', state: 'sent', recorded: true})).toBe('sent');
  expect(emailSendOutcome({id: 'd', mode: 'send', state: 'sent', recorded: false})).toBe('unconfirmed');
  expect(emailSendOutcome({id: 'd', mode: 'send', state: 'awaiting_evidence', recorded: true})).toBe('unconfirmed');
 });
 it('keeps accepted evidence pending until history is recorded', () => {
  expect(emailSendOutcome({id: 'd', mode: 'send', state: 'awaiting_evidence', gmailAccepted: true, recorded: false})).toBe('history-pending');
  expect(emailSendOutcome({id: 'd', mode: 'send', state: 'sent', gmailAccepted: true, recorded: true})).toBe('sent');
 });
 it('does not turn missing or provider Draft evidence into Sent', () => {
  expect(emailSendOutcome(undefined)).toBe('unconfirmed');
  expect(emailSendOutcome(null)).toBe('unconfirmed');
  expect(emailSendOutcome({id: 'd', mode: 'draft', state: 'created'})).toBe('unconfirmed');
 });
});

it('shows Email sent with History update pending for accepted evidence', () => {
 const html = markup({state: 'history-pending', recovery: createElement('button', null, 'Check existing result')});
 expect(html).toContain('>Email sent</h2>');
 expect(html).toContain('History update pending');
 expect(html).toContain('Gmail accepted this email. You can return to Collections while history processing continues. Do not resend.');
 expect(html).not.toContain('history recorded');
 expect(html).toContain('Check existing result');
 expect(back(html)).not.toContain('disabled');
 expect(html).toContain('target="_blank" rel="noopener noreferrer"');
 expect(html).toContain('Open Gmail Sent');
});
it('presents accepted completion as success while unconfirmed evidence needs attention', () => {
 const accepted = markup({state: 'history-pending'});
 const unconfirmed = markup({state: 'unconfirmed'});
 expect(accepted).toContain('data-tone="success"');
 expect(accepted).toContain('lucide-check');
 expect(accepted).not.toContain('lucide-clock');
 expect(accepted).toContain('class="email-send-result__pending">History update pending');
 expect(accepted).toContain('Gmail accepted this email. You can return to Collections while history processing continues. Do not resend.');
 expect(unconfirmed).toContain('data-tone="attention"');
 expect(unconfirmed).toContain('lucide-triangle-alert');
 expect(unconfirmed).not.toContain('data-tone="success"');
});
it('shows recorded success and scoped counts', () => {
 const html = markup();
 expect(html).toContain('>Email sent</h2>');
 expect(html).toContain('Billing / collection history recorded.');
 for (const label of ['Messages', 'Accounts', 'Invoices', 'Files']) expect(html).toContain(label);
 expect(html).toContain('Reviewed email scope');
});
it('shows Email results for partial without claiming Emails sent', () => {
 const html = markup({state: 'partial', counts: {...props.counts, messages: 2}, detail: '1 accepted message; 1 unconfirmed attempt; 2 unattempted Accounts.', children: createElement('button', null, 'Review remaining emails')});
 expect(html).toContain('>Email results</h2>');
 expect(html).not.toContain('>Emails sent</h2>');
 expect(html).toContain('2 unattempted Accounts.');
 expect(html).toContain('Review remaining emails');
});
it('disables Back to Collections while sending', () => {
 const html = markup({state: 'sending'});
 expect(html).toContain('Sending email…');
 expect(back(html)).toContain('disabled');
 expect(html).toContain('role="status"');
 expect(html).not.toContain('Billing / collection history recorded.');
});
it('pluralizes actual messages without confusing Account count', () => {
 expect(markup({counts: {...props.counts, messages: 2}})).toContain('>Emails sent</h2>');
 expect(markup({state: 'sending', counts: {...props.counts, messages: 2}})).toContain('Sending emails…');
});
it('keeps Back enabled for history-pending with busy true', () => {
 const html = markup({state: 'history-pending', busy: true});
 expect(back(html)).not.toContain('disabled');
 expect(html).toContain('Checking existing result…');
 expect(html).not.toContain('Sending email…');
});
it('disables Back when backDisabled is true', () => expect(back(markup({backDisabled: true}))).toContain('disabled'));
it('shows unavailable files without a false zero', () => {
 const html = markup({counts: {...props.counts, files: null}, recipientGroups: [{key: 'a', label: 'Account A', recipients: null}]});
 expect(html).toContain('Unavailable');
 expect(html).toContain('Recipient details unavailable.');
 expect(html).not.toContain('>0<');
});
it('renders recipient groups separately', () => {
 const html = markup({recipientGroups: [...props.recipientGroups, {key: 'tsk-b', label: 'TSK / Account B', recipients: {to: ['other@example.test'], cc: [], bcc: []}}]});
 expect(html).toContain('KAT / Account A');
 expect(html).toContain('TSK / Account B');
 expect(html).toContain('<details');
 for (const address of ['billing@example.test', 'cc@example.test', 'bcc@example.test', 'other@example.test']) expect(html).toContain(address);
 expect(html).toContain('CC');
 expect(html).toContain('BCC');
});
it('shows unconfirmed evidence without a success claim and preserves host errors', () => {
 const html = markup({state: 'unconfirmed', error: 'Could not check the existing result.'});
 expect(html).toContain('>Sending not confirmed</h2>');
 expect(html).toContain('Check the existing result before taking another action. Do not resend.');
 expect(html).toContain('role="alert"');
 expect(html).toContain('Could not check the existing result.');
 expect(html).not.toContain('>Email sent</h2>');
});
