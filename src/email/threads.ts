/** Provider-derived metadata only. Browser input never supplies RFC headers. */
export interface ThreadChoice {
  threadId: string;
  parentMessageId: string;
  rfcMessageId: string;
  references: string[];
  subject: string;
  matchedRecipients: string[];
  parentDate: string;
}
export interface ThreadSummary {
  threadId: string;
  parentMessageId: string;
  subject: string;
  participants: string[];
  latestAt: string;
  messageCount: number;
}
export interface ThreadMessage {
  id: string;
  date: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  direction: 'incoming' | 'outgoing' | 'unknown';
  matchesReply: boolean;
}
export interface ThreadList { threads: ThreadSummary[]; nextPageToken: string | null }
export interface ThreadPreview {
  thread: ThreadSummary;
  historyId: string;
  messages: ThreadMessage[];
  nextMessageOffset: number | null;
  checkedAt: string;
}
