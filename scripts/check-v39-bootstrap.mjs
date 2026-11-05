import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('.footer')?.getAttribute('data-v39-ready')==='true'||document.querySelector('[data-v39-load-stage]')?.textContent?.includes('失敗'),{},{timeout:30000});
 const result=await page.evaluate(()=>({ready:document.querySelector('.footer')?.getAttribute('data-v39-ready'),failure:document.querySelector('[data-v39-load-stage]')?.textContent||''}));
 assert.equal(result.ready,'true',JSON.stringify({result,errors}));
 assert.deepEqual(errors,[]);
 console.log('PASS: served production build completes bootstrap without page errors. No gameplay or screenshot checks.');
}finally{await browser.close();}
