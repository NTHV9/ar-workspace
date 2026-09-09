import {useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react';
import {Bold, Italic, Underline, List, Link, Unlink, Quote, Undo2, Redo2} from 'lucide-react';
import {parseRichMessage, plainMessage, richText, safeMessageHref, RICH_MESSAGE_LIMITS, type RichBlock, type RichMessage, type RichRun} from './rich-message';
import './rich-message.css';

type Marks = Omit<RichRun, 'text'>;
type Props = {value: RichMessage; onChange: (message: RichMessage) => void; disabled?: boolean; id?: string; label?: string};
const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE']);
const discardedTags = new Set(['SCRIPT', 'STYLE', 'IMG', 'SVG', 'MATH', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'SOURCE', 'LINK', 'META']);

/** Read visible editable nodes only; no imported HTML/CSS is persisted. */
function readEditable(root: HTMLElement): RichMessage {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null, nodeCount = 0;
  const flush = () => {if (current) blocks.push(current); current = null;};
  const text = (value: string, marks: Marks, type: RichBlock['type']) => {
    current ??= {type, runs: []};
    current.runs.push({text: value, ...marks});
  };
  function walk(node: Node, marks: Marks, type: RichBlock['type'], depth: number) {
    if (++nodeCount > 20_000 || depth > 32) throw new Error('rich_message_too_large');
    if (node.nodeType === Node.TEXT_NODE) {text(node.textContent ?? '', marks, type); return;}
    if (!(node instanceof HTMLElement) || discardedTags.has(node.tagName)) return;
    if (node.tagName === 'BR') {
      if (!node.hasAttribute('data-message-placeholder') && (node.hasAttribute('data-message-break') || node.parentElement?.childNodes.length !== 1)) text('\n', marks, type);
      return;
    }
    const next = {...marks};
    if (node.tagName === 'B' || node.tagName === 'STRONG') next.bold = true;
    if (node.tagName === 'I' || node.tagName === 'EM') next.italic = true;
    if (node.tagName === 'U') next.underline = true;
    if (node.style.fontWeight) next.bold = node.style.fontWeight === 'bold' || Number.parseInt(node.style.fontWeight) >= 600;
    if (node.style.fontStyle) next.italic = node.style.fontStyle === 'italic';
    if (node.style.textDecorationLine) next.underline = node.style.textDecorationLine.includes('underline');
    if (node.tagName === 'A') next.href = safeMessageHref(node.getAttribute('href'));
    const isBlock = blockTags.has(node.tagName);
    if (isBlock) flush();
    const before = blocks.length;
    const nextType = node.tagName === 'LI' ? 'bullet' : node.tagName === 'BLOCKQUOTE' ? 'quote' : type;
    for (const child of node.childNodes) walk(child, next, nextType, depth + 1);
    if (isBlock) {
      if (!current && before === blocks.length) current = {type: nextType, runs: [{text: ''}]};
      flush();
    }
  }
  for (const node of root.childNodes) walk(node, {}, 'paragraph', 0);
  flush();
  return parseRichMessage({version: 1, blocks});
}

/** Construct trusted editable DOM directly from the canonical representation. */
function writeEditable(root: HTMLElement, value: RichMessage) {
  const fragment = document.createDocumentFragment();
  let list: HTMLUListElement | null = null;
  for (const block of value.blocks) {
    const element = document.createElement(block.type === 'bullet' ? 'li' : block.type === 'quote' ? 'blockquote' : 'p');
    if (block.type === 'bullet') {
      if (!list) {list = document.createElement('ul'); fragment.appendChild(list);}
      list.appendChild(element);
    } else {list = null; fragment.appendChild(element);}
    for (const run of block.runs) {
      let target: HTMLElement = element;
      const tags = [run.href ? 'a' : '', run.bold ? 'strong' : '', run.italic ? 'em' : '', run.underline ? 'u' : ''].filter(Boolean);
      for (const tag of tags) {
        const child = document.createElement(tag);
        if (tag === 'a') {child.setAttribute('href', run.href!); child.setAttribute('rel', 'noopener noreferrer');}
        target.appendChild(child); target = child;
      }
      run.text.split('\n').forEach((part, index) => {
        if (index) {const br = document.createElement('br'); br.setAttribute('data-message-break', ''); target.appendChild(br);}
        target.appendChild(document.createTextNode(part));
      });
    }
    if (!block.runs.some(run => run.text)) {const br = document.createElement('br'); br.setAttribute('data-message-placeholder', ''); element.appendChild(br);}
  }
  root.replaceChildren(fragment);
}

function issueText(error: unknown): string {
  return error instanceof Error && error.message === 'rich_message_too_large'
    ? 'This edit is too large or too complex. Shorten it and try again; your previous message is retained.'
    : 'This edit contains unsupported text or a link. Use an HTTPS address or a mailto address without extra fields.';
}

export function RichMessageEditor({value, onChange, disabled = false, id, label = 'Email message'}: Props) {
  const generatedId = useId(), editorId = id ?? `message-${generatedId}`;
  const editor = useRef<HTMLDivElement>(null), selection = useRef<Range | null>(null), linkInput = useRef<HTMLInputElement>(null);
  const accepted = useRef(parseRichMessage(value)), emitted = useRef('');
  const [plain, setPlain] = useState(false), [issue, setIssue] = useState(''), [linkOpen, setLinkOpen] = useState(false), [href, setHref] = useState('');
  const [active, setActive] = useState({bold: false, italic: false, underline: false, bullet: false, quote: false, link: false});

  useLayoutEffect(() => {
    const canonical = parseRichMessage(value), serialized = JSON.stringify(canonical);
    accepted.current = canonical;
    if (serialized !== emitted.current) {setLinkOpen(false); setIssue(''); selection.current = null;}
    if (editor.current && (serialized !== emitted.current || !editor.current.hasChildNodes())) {
      writeEditable(editor.current, canonical); selection.current = null;
    }
    emitted.current = serialized;
  }, [value, plain]);

  function rememberSelection() {
    const current = window.getSelection(), root = editor.current;
    if (!root || !current?.rangeCount || !root.contains(current.anchorNode) || !root.contains(current.focusNode)) return;
    selection.current = current.getRangeAt(0).cloneRange();
    const element = current.anchorNode instanceof Element ? current.anchorNode : current.anchorNode?.parentElement;
    setActive({bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), bullet: !!element?.closest('li'), quote: !!element?.closest('blockquote'), link: !!element?.closest('a')});
  }
  useEffect(() => {
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);
  useEffect(() => {if (linkOpen) linkInput.current?.focus();}, [linkOpen]);
  useEffect(() => {if (disabled) setLinkOpen(false);}, [disabled]);

  function commit(message: RichMessage) {
    const canonical = parseRichMessage(message);
    accepted.current = canonical; emitted.current = JSON.stringify(canonical);
    onChange(canonical); setIssue('');
  }
  function changed() {
    if (disabled || !editor.current) return;
    try {commit(readEditable(editor.current)); rememberSelection();}
    catch (error) {writeEditable(editor.current, accepted.current); selection.current = null; setIssue(issueText(error));}
  }
  function restoreSelection() {
    const root = editor.current;
    if (!root) return;
    root.focus();
    const current = window.getSelection();
    const range = selection.current;
    if (range && root.contains(range.startContainer) && root.contains(range.endContainer)) {
      current?.removeAllRanges(); current?.addRange(range);
    }
  }
  function command(name: string, argument?: string) {
    if (disabled || plain) return;
    // selectionchange is queued: a fast Ctrl+A then Ctrl+B can precede it.
    // Prefer the live editor selection, retaining the saved range for link inputs.
    rememberSelection();
    restoreSelection();
    // Native editing commands preserve browser undo/redo. All output is reparsed above.
    document.execCommand(name, false, argument); changed();
  }
  function openLink() {
    if (disabled || plain) return;
    rememberSelection();
    const range = selection.current, root = editor.current;
    if (!range || !root?.contains(range.commonAncestorContainer)) {setIssue('Select the words to link first.'); return;}
    const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const existing = element?.closest('a');
    if (range.collapsed && existing) {range.selectNodeContents(existing); selection.current = range;}
    if (range.collapsed) {setIssue('Select the words to link first.'); return;}
    setIssue(''); setHref(existing?.getAttribute('href') ?? ''); setLinkOpen(true);
  }
  function applyLink() {
    try {const safe = safeMessageHref(href); command('createLink', safe); setLinkOpen(false);}
    catch (error) {setIssue(issueText(error));}
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase(), commands: Record<string, string> = {b: 'bold', i: 'italic', u: 'underline'};
      if (commands[key]) {event.preventDefault(); command(commands[key]);}
      if (key === 'k') {event.preventDefault(); openLink();}
    }
  }
  function toolbarKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : controls.length - 1)) % controls.length;
    controls[next]?.focus();
  }
  const tools = [
    {name: 'Bold', icon: Bold, pressed: active.bold, run: () => command('bold')},
    {name: 'Italic', icon: Italic, pressed: active.italic, run: () => command('italic')},
    {name: 'Underline', icon: Underline, pressed: active.underline, run: () => command('underline')},
    {name: 'Bullet list', icon: List, pressed: active.bullet, run: () => command('insertUnorderedList')},
    {name: 'Quote', icon: Quote, pressed: active.quote, run: () => command('formatBlock', active.quote ? 'p' : 'blockquote')},
    {name: 'Add or edit link', icon: Link, pressed: active.link, run: openLink},
    {name: 'Remove link', icon: Unlink, run: () => command('unlink')},
    {name: 'Undo', icon: Undo2, run: () => command('undo')},
    {name: 'Redo', icon: Redo2, run: () => command('redo')},
  ];
  return <div className="rich-message-editor" data-disabled={disabled || undefined}>
    <div className="rich-message-heading"><label htmlFor={editorId}>{label}</label><div className="rich-message-modes" aria-label="Message view">
      <button type="button" aria-pressed={!plain} onClick={() => {setPlain(false); setLinkOpen(false);}}>Formatted</button>
      <button type="button" aria-pressed={plain} onClick={() => {setPlain(true); setLinkOpen(false);}}>Plain text</button>
    </div></div>
    {!plain && <div className="rich-message-toolbar" role="toolbar" aria-label="Message formatting" onKeyDown={toolbarKeyboard}>
      {[tools.slice(0,3),tools.slice(3,7),tools.slice(7)].map((group,index) => <span className="rich-message-tool-group" key={index}>{group.map(tool => <button key={tool.name} type="button" title={tool.name} aria-label={tool.name} aria-pressed={tool.pressed} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={tool.run}><tool.icon size={16} aria-hidden="true"/></button>)}</span>)}
    </div>}
    {linkOpen && <div className="rich-message-link" role="group" aria-label="Message link">
      <label htmlFor={`${editorId}-link`}>Link address</label><input ref={linkInput} id={`${editorId}-link`} type="text" value={href} maxLength={RICH_MESSAGE_LIMITS.href} placeholder="https://example.com or mailto:name@example.com" onChange={event => setHref(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); applyLink();} if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); setLinkOpen(false); restoreSelection();}}}/>
      <div><button type="button" onClick={applyLink}>Apply link</button><button type="button" onClick={() => {setLinkOpen(false); restoreSelection();}}>Cancel</button></div>
    </div>}
    {plain ? <><p id={`${editorId}-help`} className="rich-message-help">Editing this view removes formatting. The text is included in every email.</p><textarea id={editorId} className="rich-message-plain" aria-label={`${label} plain text`} aria-describedby={`${editorId}-help`} value={richText(value)} disabled={disabled} maxLength={RICH_MESSAGE_LIMITS.text} onChange={event => {try {commit(plainMessage(event.target.value));} catch (error) {setIssue(issueText(error));}}}/></>
      : <div ref={editor} id={editorId} className="rich-message-content" role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} aria-describedby={issue ? `${editorId}-issue` : undefined} contentEditable={!disabled} suppressContentEditableWarning spellCheck onInput={event => {if (!(event.nativeEvent as InputEvent).isComposing) changed();}} onKeyDown={keyboard} onCompositionEnd={changed} onClick={event => {if ((event.target as Element).closest('a')) event.preventDefault();}} onPaste={event => {
        event.preventDefault(); if (disabled) return;
        const text = event.clipboardData.getData('text/plain');
        if (!text && event.clipboardData.types.length) {setIssue('Paste text into the message. Add documents or images with the attachment controls.'); return;}
        try {plainMessage(text); command('insertText', text.replace(/\r\n?/g, '\n'));} catch (error) {setIssue(issueText(error));}
      }} onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); setIssue('Paste text into the message. Add documents or images with the attachment controls.');}}/>}
    {issue && <p id={`${editorId}-issue`} className="rich-message-issue" role="alert">{issue}</p>}
  </div>;
}

export default RichMessageEditor;
