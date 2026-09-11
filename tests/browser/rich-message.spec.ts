import {expect, test, type Page} from '@playwright/test';

const route = 'http://127.0.0.1:5191/tests/browser/rich-message-harness.html';
async function selectText(page: Page, text: string) {
  await page.getByRole('textbox', {name: 'Email message', exact: true}).evaluate((root, match) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(match) ?? -1;
      if (start < 0) continue;
      (root as HTMLElement).focus();
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + match.length);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); return;
    }
    throw Error('Synthetic selection text not found');
  }, text);
}
async function setPlain(page: Page, text: string) {
  await page.evaluate(text => (window as any).messageTest.set({version:1,blocks:text.split('\n').map(text=>({type:'paragraph',runs:[{text}]}))}), text);
}
const model = (page: Page) => page.evaluate(() => (window as any).messageTest.value);

test('formatting through toolbar and keyboard persists through save/reload', async ({page}) => {
  await page.goto(route); await setPlain(page, 'First item\nSecond item');
  await selectText(page, 'First'); await page.getByRole('button', {name:'Bold',exact:true}).click();
  await selectText(page, 'First'); await page.keyboard.press('Control+i'); await page.keyboard.press('Control+u');
  await expect.poll(async () => (await model(page)).blocks[0].runs[0]).toEqual({text:'First',bold:true,italic:true,underline:true});
  await selectText(page, 'Second item'); await page.getByRole('button', {name:'Bullet list',exact:true}).click();
  expect((await model(page)).blocks[1].type).toBe('bullet');
  const before = await model(page);
  await page.getByRole('button',{name:'Save synthetic message'}).click(); await page.getByRole('button',{name:'Reload saved message'}).click();
  expect(await model(page)).toEqual(before);
  await expect(page.locator('.rich-message-content strong em u')).toHaveText('First');
  await expect(page.locator('.rich-message-content li')).toHaveText('Second item');
});

test('validates links, preserves the selection while editing and removes links', async ({page}) => {
  await page.goto(route); await setPlain(page, 'View documents'); await selectText(page, 'documents');
  await page.keyboard.press('Control+k'); await page.getByRole('textbox',{name:'Link address'}).fill('javascript:alert(1)'); await page.getByRole('button',{name:'Apply link'}).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS'); expect((await model(page)).blocks[0].runs).toEqual([{text:'View documents'}]);
  await page.getByRole('textbox',{name:'Link address'}).fill('https://example.invalid/review?x=1&y=2'); await page.getByRole('button',{name:'Apply link'}).click();
  await expect(page.locator('.rich-message-content a')).toHaveText('documents');
  expect((await model(page)).blocks[0].runs[1]).toEqual({text:'documents',href:'https://example.invalid/review?x=1&y=2'});
  await selectText(page, 'documents'); await page.getByRole('button',{name:'Remove link'}).click();
  await expect(page.locator('.rich-message-content a')).toHaveCount(0);
});

test('pastes only text without executing or fetching HTML, and rejects file drops', async ({page}) => {
  await page.goto(route); await setPlain(page, 'Replace'); await selectText(page, 'Replace');
  const external: string[] = [];
  page.on('request', request => {if(request.url().includes('example.invalid')) external.push(request.url());});
  await page.getByRole('textbox',{name:'Email message',exact:true}).evaluate(root => {
    const clipboard = new DataTransfer(); clipboard.setData('text/html','<img src="https://example.invalid/tracker.png" onerror="window.injected=true"><script>window.injected=true<\/script><b>Unsafe markup</b>'); clipboard.setData('text/plain','<script>literal text</script>\nSecond line');
    root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clipboard}));
  });
  await expect(page.locator('.rich-message-content')).toHaveText('<script>literal text</script>Second line');
  expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('<script>literal text</script>\nSecond line');
  expect(await page.evaluate(()=>(window as any).injected)).toBeUndefined(); expect(external).toEqual([]);
  await expect(page.locator('.rich-message-content img,.rich-message-content script')).toHaveCount(0);
  await page.locator('.rich-message-content').dispatchEvent('drop');
  await expect(page.getByRole('alert')).toContainText('attachment controls');
});

test('plain view preserves formatting until edited, then explicitly converts the message', async ({page}) => {
  await page.goto(route); await setPlain(page, 'Hello'); await selectText(page,'Hello'); await page.getByRole('button',{name:'Bold',exact:true}).click();
  const before = await model(page);
  await page.getByRole('button',{name:'Plain text',exact:true}).click(); await expect(page.getByRole('textbox',{name:'Email message plain text'})).toHaveValue('Hello');
  expect(await model(page)).toEqual(before); await expect(page.getByText('Editing this view removes formatting. The text is included in every email.')).toBeVisible();
  await page.getByRole('textbox',{name:'Email message plain text'}).fill('Hello\n\nUpdated'); await page.getByRole('button',{name:'Formatted',exact:true}).click();
  await expect(page.locator('.rich-message-content strong')).toHaveCount(0); expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Hello\n\nUpdated');
});

test('native undo and redo restore edits and toolbar is keyboard reachable', async ({page}) => {
  await page.goto(route); await setPlain(page,'Original'); await selectText(page,'Original');
  await page.keyboard.type('Changed'); expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Changed');
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Original');
  await page.getByRole('button',{name:'Redo',exact:true}).click(); expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Changed');
  await page.getByRole('button',{name:'Bold',exact:true}).focus(); await page.keyboard.press('ArrowRight'); await expect(page.getByRole('button',{name:'Italic',exact:true})).toBeFocused();
});

test('select-all keyboard formatting reads the live selection before selectionchange arrives', async ({page}) => {
  await page.goto(route);
  const editor=page.getByRole('textbox',{name:'Email message',exact:true});
  await editor.fill('Synthetic rich test');
  // Browsers queue selectionchange separately. Hold that notification to exercise
  // the actual Ctrl+A → Ctrl+B path while the editor still has its previous caret.
  await page.evaluate(()=>document.addEventListener('selectionchange',event=>event.stopImmediatePropagation(),true));
  await editor.press('ControlOrMeta+A');
  expect(await page.evaluate(()=>window.getSelection()?.toString())).toBe('Synthetic rich test');
  await editor.press('ControlOrMeta+b');
  await expect(editor.locator('b,strong')).toHaveText('Synthetic rich test');
  expect((await model(page)).blocks[0].runs).toEqual([{text:'Synthetic rich test',bold:true}]);
});

test('disabled editor blocks typing and formatting, and oversized paste retains the message', async ({page}) => {
  await page.goto(route); await setPlain(page,'Retained'); await selectText(page,'Retained');
  await page.locator('.rich-message-content').evaluate(root=>{const clipboard=new DataTransfer(); clipboard.setData('text/plain','x'.repeat(100001));root.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clipboard}));});
  await expect(page.getByRole('alert')).toContainText('too large'); expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Retained');
  await page.getByRole('button',{name:'Disable editing'}).click(); await expect(page.locator('.rich-message-content')).toHaveAttribute('contenteditable','false'); await expect(page.getByRole('button',{name:'Bold',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Plain text',exact:true}).click(); await expect(page.getByRole('textbox',{name:'Email message plain text'})).toBeDisabled();
});

test('paragraphs, soft breaks, quotation and toggled formatting survive editing and reload', async ({page}) => {
  await page.goto(route); await setPlain(page,'First'); await selectText(page,'First'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); await page.keyboard.type('Second'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Soft break');
  expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('First\nSecond\nSoft break');
  await selectText(page,'First'); await page.getByRole('button',{name:'Quote',exact:true}).click(); expect((await model(page)).blocks[0].type).toBe('quote');
  await selectText(page,'First'); await page.getByRole('button',{name:'Quote',exact:true}).click(); expect((await model(page)).blocks[0].type).toBe('paragraph');
  await selectText(page,'Second'); await page.getByRole('button',{name:'Bold',exact:true}).click(); await selectText(page,'Second'); await page.getByRole('button',{name:'Bold',exact:true}).click();
  expect((await model(page)).blocks.flatMap((block:any)=>block.runs).some((run:any)=>run.bold)).toBe(false);
  const before=await model(page); await page.getByRole('button',{name:'Save synthetic message'}).click(); await page.getByRole('button',{name:'Reload saved message'}).click();
  await selectText(page,'First'); await page.keyboard.press('ArrowRight'); await page.keyboard.type('!');
  expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('First!\nSecond\nSoft break');
  expect(before.blocks.length).toBe(2);
});

test('external replacement cannot resurrect previous edits through undo or a pending link', async ({page}) => {
  await page.goto(route); await setPlain(page,'Original'); await selectText(page,'Original'); await page.keyboard.type('Changed');
  await setPlain(page,'Replacement'); await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).messageTest.text())).toBe('Replacement');
  await selectText(page,'Replacement'); await page.getByRole('button',{name:'Add or edit link',exact:true}).click();
  await setPlain(page,'Newest template'); await expect(page.getByRole('group',{name:'Message link'})).toHaveCount(0);
});

test('external message replacement resets editor and desktop/mobile layouts stay contained', async ({page}, testInfo) => {
  const errors: string[] = []; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(route); await setPlain(page,'This draft was replaced by an explicitly selected template.');
  await expect(page.locator('.rich-message-content')).toHaveText('This draft was replaced by an explicitly selected template.');
  await page.evaluate(()=>(window as any).messageTest.set({version:1,blocks:[{type:'paragraph',runs:[{text:'Dear recipient,'}]},{type:'paragraph',runs:[{text:'Please review the '},{text:'selected billing documents',bold:true},{text:' attached to this message.'}]},{type:'bullet',runs:[{text:'Statement for your review'}]},{type:'bullet',runs:[{text:'Invoice and folio copies'}]},{type:'paragraph',runs:[{text:'Contact the AR team',href:'mailto:ar@example.invalid'},{text:' if you need any additional details.'}]},{type:'paragraph',runs:[{text:'Kind regards,\nAccounts Receivable'}]}]}));
  for (const size of [{width:1280,height:800},{width:390,height:844}]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`rich-message-${size.width}.png`),fullPage:true});
  }
  expect(errors).toEqual([]);
});
