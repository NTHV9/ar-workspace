/** Shared browser/Worker boundary. No HTML, DOM or provider input is trusted. */
export type RichRun = {text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string};
export type RichBlock = {type: 'paragraph' | 'bullet' | 'quote'; runs: RichRun[]};
export type RichMessage = {version: 1; blocks: RichBlock[]};

export const RICH_MESSAGE_LIMITS = Object.freeze({text: 100_000, blocks: 1_000, runs: 4_000, href: 2_048, totalHref: 16_384});
const invalid = (): never => {throw new Error('rich_message_invalid');};
const tooLarge = (): never => {throw new Error('rich_message_too_large');};

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || !descriptor.enumerable) return invalid();
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid();
  if (value.length > limit) return tooLarge();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) return invalid();
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) return invalid();
  }
  return value;
}

function messageText(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  if (value.length > RICH_MESSAGE_LIMITS.text) return tooLarge();
  const text = value.replace(/\r\n?/g, '\n');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return invalid();
  // Invalid UTF-16 would change during MIME UTF-8 encoding, making evidence ambiguous.
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return invalid();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return invalid();
  }
  return text;
}

/** Explicit clickable links only; never fetched by the editor or backend. */
export function safeMessageHref(value: unknown): string {
  if (typeof value !== 'string' || !value) return invalid();
  if (value.length > RICH_MESSAGE_LIMITS.href) return tooLarge();
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.href.length > RICH_MESSAGE_LIMITS.href) return tooLarge();
  if (/^https:\/\//i.test(value) && url.protocol === 'https:' && url.hostname && !url.username && !url.password) return url.href;
  // No mailto query/fragment or encoded header fields. A link has one explicit recipient.
  if (url.protocol === 'mailto:' && !url.search && !url.hash && /^[a-z0-9.!#$&'*+/=^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(url.pathname) && url.pathname.length <= 254) return `mailto:${url.pathname}`;
  return invalid();
}

export function parseRichMessage(input: unknown): RichMessage {
  const root = record(input, ['version', 'blocks']);
  if (root.version !== 1) return invalid();
  let textSize = 0, runCount = 0, hrefSize = 0;
  const blocks: RichBlock[] = array(root.blocks, RICH_MESSAGE_LIMITS.blocks).map(value => {
    const block = record(value, ['type', 'runs']);
    if (block.type !== 'paragraph' && block.type !== 'bullet' && block.type !== 'quote') return invalid();
    const runs: RichRun[] = [];
    for (const item of array(block.runs, RICH_MESSAGE_LIMITS.runs)) {
      if (++runCount > RICH_MESSAGE_LIMITS.runs) return tooLarge();
      const raw = record(item, ['text', 'bold', 'italic', 'underline', 'href']);
      const text = messageText(raw.text);
      textSize += (raw.text as string).length;
      if (textSize > RICH_MESSAGE_LIMITS.text) return tooLarge();
      const run: RichRun = {text};
      for (const key of ['bold', 'italic', 'underline'] as const) {
        if (Object.hasOwn(raw, key) && typeof raw[key] !== 'boolean') return invalid();
        if (raw[key] === true) run[key] = true;
      }
      if (Object.hasOwn(raw, 'href')) {
        run.href = safeMessageHref(raw.href);
        hrefSize += run.href.length;
        if (hrefSize > RICH_MESSAGE_LIMITS.totalHref) return tooLarge();
      }
      // Empty runs cannot carry visible formatting. A blank block is represented by one plain run.
      if (!text) continue;
      const previous = runs.at(-1);
      if (previous && previous.bold === run.bold && previous.italic === run.italic && previous.underline === run.underline && previous.href === run.href) previous.text += text;
      else runs.push(run);
    }
    return {type: block.type, runs: runs.length ? runs : [{text: ''}]};
  });
  const plainSize = blocks.reduce((size, block) => size + (block.type === 'paragraph' ? 0 : 2) + block.runs.reduce((sum, run) => sum + run.text.length, 0), Math.max(0, blocks.length - 1));
  if (plainSize > RICH_MESSAGE_LIMITS.text) return tooLarge();
  const result:RichMessage={version: 1, blocks: blocks.length ? blocks : [{type: 'paragraph', runs: [{text: ''}]}]};
  // PostgreSQL jsonb text adds separator spaces. Reserve space for those and the template envelope.
  if(new TextEncoder().encode(JSON.stringify(result)).length>450000)return tooLarge();
  return result;
}

export function plainMessage(text: string): RichMessage {
  const normalized = messageText(text);
  return parseRichMessage({version: 1, blocks: normalized.split('\n').map(line => ({type: 'paragraph', runs: [{text: line}]}))});
}

export function richText(input: RichMessage): string {
  return parseRichMessage(input).blocks.map(block => `${block.type === 'bullet' ? '• ' : block.type === 'quote' ? '> ' : ''}${block.runs.map(run => run.text).join('')}`).join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function richHtml(input: RichMessage): string {
  let html = '', list = false;
  for (const block of parseRichMessage(input).blocks) {
    if (block.type === 'bullet' && !list) {html += '<ul>'; list = true;}
    if (block.type !== 'bullet' && list) {html += '</ul>'; list = false;}
    const content = block.runs.map(run => {
      let text = escapeHtml(run.text).replace(/\n/g, '<br>');
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;
      if (run.href) text = `<a href="${escapeHtml(run.href)}" rel="noopener noreferrer">${text}</a>`;
      return text;
    }).join('') || '<br>';
    const tag = block.type === 'bullet' ? 'li' : block.type === 'quote' ? 'blockquote' : 'p';
    html += `<${tag}>${content}</${tag}>`;
  }
  return html + (list ? '</ul>' : '');
}
