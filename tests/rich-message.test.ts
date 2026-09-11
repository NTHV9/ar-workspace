import {describe, expect, it} from 'vitest';
import {parseRichMessage, plainMessage, richHtml, richText, safeMessageHref, RICH_MESSAGE_LIMITS} from '../src/email/rich-message';

const doc = (runs: unknown[], type = 'paragraph') => ({version: 1, blocks: [{type, runs}]});

describe('rich message trust boundary', () => {
  it('canonicalizes formatting, line endings, links and adjacent runs deterministically', () => {
    const parsed = parseRichMessage(doc([{text: 'A\r\n', bold: true, italic: false}, {text: 'B', bold: true}, {text: 'C', href: 'HTTPS://Example.invalid'}]));
    expect(parsed).toEqual(doc([{text: 'A\nB', bold: true}, {text: 'C', href: 'https://example.invalid/'}]));
    expect(parseRichMessage(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(richText(parsed)).toBe('A\nBC');
  });
  it('escapes content and attributes, never allowing markup to become nodes', () => {
    const parsed = parseRichMessage(doc([{text: '<img src=x onerror=alert(1)> & "\'\nnext', bold: true, italic: true, underline: true, href: 'https://example.invalid/?q=%22&x=1'}]));
    expect(richHtml(parsed)).toBe('<p><a href="https://example.invalid/?q=%22&amp;x=1" rel="noopener noreferrer"><strong><em><u>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;&#39;<br>next</u></em></strong></a></p>');
  });
  it('preserves blank lines and constructs list and quote alternatives', () => {
    const parsed = parseRichMessage({version: 1, blocks: [{type:'paragraph',runs:[{text:'Hello'}]}, {type:'bullet',runs:[{text:'One'}]}, {type:'bullet',runs:[{text:'Two'}]}, {type:'quote',runs:[{text:'Thanks'}]}, {type:'paragraph',runs:[]}]});
    expect(richText(parsed)).toBe('Hello\n• One\n• Two\n> Thanks\n');
    expect(richHtml(parsed)).toBe('<p>Hello</p><ul><li>One</li><li>Two</li></ul><blockquote>Thanks</blockquote><p><br></p>');
    expect(richText(plainMessage('Hello\r\n\r\nWorld\r'))).toBe('Hello\n\nWorld\n');
    expect(richText(plainMessage(''))).toBe('');
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'http://example.invalid', '//example.invalid', 'https:example.invalid', ' https://example.invalid', 'https://user:secret@example.invalid', 'https://example.invalid\\@evil.invalid', 'https://example.invalid\n', 'mailto:a@example.invalid?bcc=b@example.invalid', 'mailto:a@example.invalid%0d%0aBcc:b@example.invalid'])('rejects unsafe link %s', href => {
    expect(() => safeMessageHref(href)).toThrow('rich_message_invalid');
    expect(() => parseRichMessage(doc([{text:'Link',href}]))).toThrow();
  });
  it('allows explicit HTTPS and bare mailto links', () => {
    expect(safeMessageHref('https://example.invalid/path#part')).toBe('https://example.invalid/path#part');
    expect(safeMessageHref('mailto:ar@example.invalid')).toBe('mailto:ar@example.invalid');
  });
  it.each([null, {}, {version:2,blocks:[]}, {version:1,blocks:[],html:'<img>'}, doc([{text:'A',style:{color:'red'}}]), doc([{text:'A',bold:1}]), doc([{text:'A',href:null}]), doc([{text:'A'}], 'script'), doc([{text:'\u0000'}]), doc([{text:'\ud800'}]), doc([{text:'\udc00'}])])('rejects invalid or ambiguous structures', input => {
    expect(() => parseRichMessage(input)).toThrow();
  });
  it('rejects prototype, accessor and symbol fields without reading accessors', () => {
    expect(() => parseRichMessage(JSON.parse('{"version":1,"blocks":[],"__proto__":{}}'))).toThrow();
    expect(() => parseRichMessage(Object.assign(Object.create({extra:true}), doc([{text:'A'}])))).toThrow();
    let reads = 0;
    const run = {get text() { reads++; return 'A'; }};
    expect(() => parseRichMessage(doc([run]))).toThrow();
    expect(reads).toBe(0);
    expect(() => parseRichMessage({...doc([{text:'A'}]), [Symbol('hidden')]:true})).toThrow();
    const sparse = Array(1);
    expect(() => parseRichMessage(doc(sparse))).toThrow();
  });
  it('bounds text, block count, run count and links before normalization', () => {
    expect(() => plainMessage('a'.repeat(RICH_MESSAGE_LIMITS.text + 1))).toThrow('rich_message_too_large');
    expect(() => parseRichMessage({version:1,blocks:Array.from({length:RICH_MESSAGE_LIMITS.blocks+1},()=>({type:'paragraph',runs:[]}))})).toThrow('rich_message_too_large');
    expect(() => parseRichMessage(doc(Array.from({length:RICH_MESSAGE_LIMITS.runs+1},()=>({text:''}))))).toThrow('rich_message_too_large');
    expect(() => parseRichMessage(doc([{text:'x',href:'https://example.invalid/'+ 'a'.repeat(RICH_MESSAGE_LIMITS.href)}]))).toThrow('rich_message_too_large');
    expect(() => parseRichMessage(doc(Array.from({length:100},()=>({text:'x',href:'https://example.invalid/'+ 'a'.repeat(1000)}))))).toThrow('rich_message_too_large');
  });
  it('rejects deeply nested unknown values without traversing them', () => {
    let nested: unknown = null;
    for(let i=0;i<10000;i++) nested = {child:nested};
    expect(() => parseRichMessage(doc([{text:'hello',nested}]))).toThrow('rich_message_invalid');
  });
  it('includes block separators and list markers in the plain-text budget', () => {
    expect(() => parseRichMessage(doc([{text:'a'.repeat(RICH_MESSAGE_LIMITS.text)}], 'bullet'))).toThrow('rich_message_too_large');
    expect(() => parseRichMessage({version:1,blocks:[{type:'paragraph',runs:[{text:'a'.repeat(RICH_MESSAGE_LIMITS.text)}]},{type:'paragraph',runs:[]}]})).toThrow('rich_message_too_large');
  });
  it('renders only after parsing, even when an unsafe value is cast as a typed message', () => {
    expect(() => richHtml(doc([{text:'Hi',href:'javascript:alert(1)'}]) as never)).toThrow();
    expect(() => richText(doc([{text:'Hi',unsafe:true}]) as never)).toThrow();
  });
});
