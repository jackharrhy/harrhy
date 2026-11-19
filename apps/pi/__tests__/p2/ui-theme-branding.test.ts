import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { Browser, browserTests } from "./browser.ts";
import { startFixture } from "./helpers.ts";

test("owner sets a tint in both schemes and can replace or reset the sidebar logo", { skip: !browserTests }, async (t) => {
 const fixture = await startFixture({ web: true });
 t.after(() => fixture.close());
 const browser = await Browser.start();
 t.after(() => browser.close());
 await browser.metrics(1280, 900);
 await browser.signIn(fixture.owner);
 await browser.open(`http://127.0.0.1:${fixture.server.port}/`);
 await browser.click('.settings-open');
 const clickText = (text: string) => browser.evaluate(`[...document.querySelectorAll('button, a')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
 await browser.wait(`[...document.querySelectorAll('button, a')].some(b=>b.textContent.trim()==='Theme')`);
 await clickText('Theme');
 await browser.wait(`document.querySelector('.pi-theme-fields input[type=range]')`);
 await browser.evaluate(`(() => { const s=document.querySelector('.pi-theme-fields input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,'250'); s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
 await clickText('Apply tint');
 await browser.wait(`document.documentElement.dataset.piTint === 'custom'`);
 for (const [mode, expected] of [['light','oklch(0.985 0.012 250)'],['dark','oklch(0.19 0.022 250)']]) {
  await browser.evaluate(`(() => { document.documentElement.dataset.theme='${mode}'; document.documentElement.dataset.colorScheme='${mode}'; })()`);
  await browser.wait(`getComputedStyle(document.documentElement).backgroundColor === ${JSON.stringify(expected)}`);
  assert.equal(await browser.evaluate(`getComputedStyle(document.documentElement).backgroundColor`), expected);
 }
 const png = await sharp({create:{width:32,height:16,channels:4,background:'#6688cc'}}).png().toBuffer();
 const choose = (bytes: number[]) => browser.evaluate(`(() => {const input=document.querySelector('.pi-theme-fields input[type=file]'); const d=new DataTransfer(); d.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],'test.png',{type:'image/png'})); input.files=d.files; input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await choose([...png]);
 await browser.wait(`document.querySelector('.custom-logo')?.naturalWidth === 32`);
 const before = await browser.evaluate(`document.querySelector('.custom-logo').src`);
 await choose([60,115,118,103,62]);
 await browser.wait(`document.querySelector('.pi-theme-fields [role=alert]')`);
 assert.equal(await browser.evaluate(`document.querySelector('.custom-logo').src`), before);
 await clickText('Reset logo to Pi');
 await browser.wait(`!document.querySelector('.custom-logo') && document.querySelector('.drawer-header-row svg.pi-logo')`);
 await clickText('Reset tint');
 await browser.wait(`!document.documentElement.dataset.piTint`);
});
