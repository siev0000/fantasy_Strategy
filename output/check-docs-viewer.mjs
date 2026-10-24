import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out='output/web-game/docs-organization';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];
try {
 for(const width of [1100,390]) {
  const page=await browser.newPage({viewport:{width,height:850}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.openDesignDocsModal==='function');
  await page.evaluate(()=>window.openDesignDocsModal());
  const modal=page.locator('#v39-design-docs-modal');await modal.waitFor({state:'visible'});
  const selected=modal.locator('.v39-doc-current code');
  if(await selected.textContent()!=='docs/README.md')throw Error('README not default');
  const category=modal.locator('.v39-doc-category');
  if(await modal.locator('.v39-doc-item[data-path="docs/MEMO.md"]').count())throw Error('History in current docs');
  await page.screenshot({path:`${out}/current-${width}.png`});
  await category.selectOption('history/');
  await modal.locator('.v39-doc-item[data-path="docs/MEMO.md"]').click();
  if(!await modal.locator('.v39-doc-reader').textContent())throw Error('Missing memo');
  await category.selectOption('design/');
  if(!await modal.locator('.v39-doc-item').count())throw Error('Missing design docs');
  if(!(await selected.textContent()).startsWith('docs/design/'))throw Error('Category did not select matching doc');
  await category.selectOption('all');
  const search=modal.locator('input.v39-doc-search');await search.fill('災害');
  await modal.locator('.v39-doc-item[data-path="docs/rules/world/災害ルール.md"]').click();
  if(!await modal.locator('.v39-doc-reader').textContent())throw Error('Relocated rules not readable');
  await page.screenshot({path:`${out}/search-${width}.png`});
  await search.fill('not-found-document-xyz');if(await modal.locator('.v39-doc-item').count())throw Error('Search mismatch');
  await page.keyboard.press('Escape');if(await modal.isVisible())throw Error('Escape not closing');
  await page.close();
 }
} finally {await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
console.log('Docs viewer OK: 1100/390px, default entry, filters, MEMO preservation, relocated rules, search, Escape; no page errors.');