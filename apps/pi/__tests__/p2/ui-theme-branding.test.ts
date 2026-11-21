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
 const picker = `document.querySelector('.pi-theme-fields input[type=color]')`;
 const preview = `document.querySelector('.pi-theme-logo-preview')`;
 await browser.wait(picker);
 assert.equal(await browser.evaluate(`${picker}.labels[0].textContent.trim()`), 'Base tint');
 assert.equal(await browser.evaluate(`${picker}.tabIndex`), 0);
 await browser.wait(`${preview}.querySelector('svg[aria-label="Pi"]')`);
 const chooseColor = (hex: string) => browser.evaluate(`(() => { const input=${picker}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(hex)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
 const previewColors = (mode: string) => browser.evaluate<string[]>(`(() => {
  const sample = document.querySelector('[data-pi-theme-preview="${mode}"]');
  return [getComputedStyle(sample).backgroundColor,
   getComputedStyle(sample.querySelector('.pi-tint-preview-session')).backgroundColor,
   getComputedStyle(sample.querySelector('.pi-tint-preview-message')).backgroundColor,
   getComputedStyle(sample.querySelector('.pi-tint-preview-composer')).borderTopColor];
 })()`);
 const schemes = ['light', 'dark'];
 const defaults = await Promise.all(schemes.map(previewColors));
 assert.notDeepEqual(defaults[0], defaults[1]);
 await chooseColor('#808080');
 await browser.wait(`document.getElementById(${picker}.getAttribute('aria-describedby')).textContent.includes('can’t be applied')`);
 assert.equal(await browser.evaluate(`[...document.querySelectorAll('.pi-theme-actions button')].find(b => b.textContent === 'Apply tint').disabled`), true);
 assert.deepEqual(await Promise.all(schemes.map(previewColors)), defaults);
 const beforeDraft = await browser.evaluate(`getComputedStyle(document.documentElement).backgroundColor`);
 await chooseColor('#3d3370');
 await browser.wait(`document.querySelector('[data-pi-theme-preview="light"]').dataset.piTint === 'custom'`);
 const draft = await Promise.all(schemes.map(previewColors));
 for (const [i, colors] of draft.entries()) {
  assert.ok(colors.every((color, j) => color !== defaults[i][j]));
 }
 assert.equal(await browser.evaluate(`getComputedStyle(document.documentElement).backgroundColor`), beforeDraft);
 assert.equal(await browser.evaluate(`document.documentElement.dataset.piTint ?? null`), null);
 await clickText('Apply tint');
 await browser.wait(`document.documentElement.dataset.piTint === 'custom'`);
 for (const [i, mode] of schemes.entries()) {
  const expected = draft[i][0];
  await browser.evaluate(`(() => { document.documentElement.dataset.theme='${mode}'; document.documentElement.dataset.colorScheme='${mode}'; })()`);
  await browser.wait(`getComputedStyle(document.documentElement).backgroundColor === ${JSON.stringify(expected)}`);
  const appColors = await browser.evaluate<string[]>(`(() => {
   const probe = document.body.appendChild(document.createElement('span'));
   try {
    return ['--bg', '--hover', '--user', '--line'].map(token => {
     probe.style.backgroundColor = 'var(' + token + ')';
     return getComputedStyle(probe).backgroundColor;
    });
   } finally { probe.remove(); }
  })()`);
  assert.deepEqual(appColors, draft[i]);
  assert.deepEqual(await previewColors(mode), draft[i]);
 }
 const png = await sharp({create:{width:32,height:16,channels:4,background:'#6688cc'}}).png().toBuffer();
 const choose = (bytes: number[]) => browser.evaluate(`(() => {const input=document.querySelector('.pi-theme-fields input[type=file]'); const d=new DataTransfer(); d.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],'test.png',{type:'image/png'})); input.files=d.files; input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await choose([...png]);
 await browser.wait(`${preview}.querySelector('img[alt="Instance logo"]')?.naturalWidth === 32`);
 await browser.wait(`document.querySelector('.drawer-header-row .custom-logo')?.naturalWidth === 32`);
 await browser.open(`http://127.0.0.1:${fixture.server.port}/`);
 await browser.click('.settings-open');
 await browser.wait(`[...document.querySelectorAll('button, a')].some(b=>b.textContent.trim()==='Theme')`);
 await clickText('Theme');
 await browser.wait(`${preview}?.querySelector('img')?.naturalWidth === 32`);
 assert.equal(await browser.evaluate(`${picker}.value`), '#5500ff');
 assert.deepEqual(await Promise.all(schemes.map(previewColors)), draft);
 const before = await browser.evaluate(`${preview}.querySelector('img').src`);
 await choose([60,115,118,103,62]);
 await browser.wait(`document.querySelector('.pi-theme-fields [role=alert]')`);
 assert.equal(await browser.evaluate(`${preview}.querySelector('img').src`), before);
 // A browser decode failure falls back without changing the stored upload.
 await browser.evaluate(`${preview}.querySelector('img').dispatchEvent(new Event('error'))`);
 await browser.wait(`${preview}.querySelector('svg[aria-label="Pi"]')`);
 await clickText('Reset logo to Pi');
 await browser.wait(`!document.querySelector('.custom-logo') && document.querySelector('.drawer-header-row svg.pi-logo') && ${preview}.querySelector('svg[aria-label="Pi"]')`);
 // Logo state may render before its save releases the shared busy flag.
 await browser.wait("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Reset tint' && !b.disabled)");
 await clickText('Reset tint');
 await browser.wait(`!document.documentElement.dataset.piTint && !document.querySelector('[data-pi-theme-preview][data-pi-tint]')`);
 assert.deepEqual(await Promise.all(schemes.map(previewColors)), defaults);
});
