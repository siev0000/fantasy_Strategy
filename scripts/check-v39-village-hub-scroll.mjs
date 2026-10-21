import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/village-hub-scroll';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const [width,height] of [[320,568],[390,844],[1100,800],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});
  await page.waitForSelector('#v39-hub-tab-talk');await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const root=page.locator('#v39-village-menu'),conversation=root.locator('[data-hub-conversation]'),tabs=root.locator('.v39-hub-tabs'),body=root.locator('.v39-village-menu-body');
  const fixed=await conversation.boundingBox(),nav=await tabs.boundingBox(),footer=await root.locator('.v39-hub-footer').boundingBox();
  for(const tab of ['talk','quests','trade','info']){
    await root.locator(`[data-hub-tab=${tab}]`).click();
    if(tab==='info')await root.locator('.v39-conversation-preparation>summary').click();
    if(tab==='trade')await root.locator('[data-trade-fold=delivery]>summary').click();
    await body.evaluate(node=>{node.scrollTop=node.scrollHeight;});
    const geometry=await body.evaluate(node=>({top:node.scrollTop,overflow:node.scrollHeight>node.clientHeight,height:node.clientHeight,hub:document.querySelector('#v39-village-menu>section').scrollTop}));
    assert(geometry.height>35,`${width}x${height}: lower pane remains usable`);
    if(geometry.overflow)assert(geometry.top>0,`${tab}: lower content scrolls`);
    assert.equal(geometry.hub,0);
    assert.deepEqual(await conversation.boundingBox(),fixed,`${tab}: conversation remains fixed`);
    assert.deepEqual(await tabs.boundingBox(),nav,`${tab}: tabs remain fixed`);
    assert.deepEqual(await root.locator('.v39-hub-footer').boundingBox(),footer,`${tab}: actions remain fixed`);
    assert(nav.y>=fixed.y+fixed.height-1);assert(footer.y+footer.height<=height+1);
  }
  await page.screenshot({path:`${out}/info-${width}x${height}.png`});
  await root.locator('[data-hub-tab=talk]').click();assert.equal(await body.evaluate(node=>node.scrollTop),0,'tab changes reset only lower scroll');
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: fixed conversation/tabs/actions and lower-only scrolling passed`);await page.close();
}}finally{await browser.close();}
